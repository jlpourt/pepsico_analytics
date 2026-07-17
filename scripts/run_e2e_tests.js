const { BigQuery } = require('@google-cloud/bigquery');
const { spawn } = require('child_process');

const bigquery = new BigQuery({ projectId: 'jamie-bq-test' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let serverProcess = null;

async function startServer() {
  console.log("Starting Next.js server on port 3001...");
  serverProcess = spawn('npx', ['next', 'dev', '-p', '3001'], {
    stdio: 'ignore', // Suppress Next.js server logs to keep test output clean
    shell: true
  });

  // Wait for server to become responsive
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('http://localhost:3001/api/graph');
      if (res.status === 200 || res.status === 404) {
        console.log("Next.js server is ready!");
        return;
      }
    } catch (err) {
      // Server not ready yet
    }
    await sleep(1000);
  }
  throw new Error("Server failed to start within 30 seconds");
}

function stopServer() {
  if (serverProcess) {
    console.log("Stopping Next.js server...");
    try {
      serverProcess.kill('SIGTERM');
    } catch (err) {
      console.error("Error stopping server:", err.message);
    }
  }
}

async function discoverTestData() {
  console.log("Discovering test data from BigQuery...");
  
  // 1. Get a fully connected chain: Agronomist -> Grower -> Field -> Plant
  const chainQuery = `
    SELECT 
      agronomistId,
      growerId,
      fieldId,
      fieldName,
      plantId
    FROM GRAPH_TABLE(
      agriflow.supply_chain_graph
      MATCH (a:Agronomist)-[:AUDITS]->(g:Grower)-[:OPERATES]->(f:Field)-[:ROUTED]->(p:Plant)
      RETURN a.id AS agronomistId, g.id AS growerId, f.id AS fieldId, f.fieldName AS fieldName, p.id AS plantId
    )
    LIMIT 1
  `;
  
  const [chainRows] = await bigquery.query(chainQuery);
  if (chainRows.length === 0) {
    throw new Error("Could not find any connected supply chain paths in the database!");
  }
  const testChain = chainRows[0];
  console.log(`Discovered connected path: Agronomist (${testChain.agronomistId}) -> Grower (${testChain.growerId}) -> Field (${testChain.fieldId}, Name: ${testChain.fieldName}) -> Plant (${testChain.plantId})`);

  // 2. Get a grower without neighboring anomalies (for Tier 2)
  const cleanGrowerQuery = `
    SELECT growerId
    FROM GRAPH_TABLE(
      agriflow.supply_chain_graph
      MATCH (g:Grower)
      RETURN g.id AS growerId
    )
    WHERE growerId NOT IN (
      SELECT DISTINCT g1_id
      FROM GRAPH_TABLE(
        agriflow.supply_chain_graph
        MATCH (g1:Grower)-[:OPERATES]->(f1:Field)-[:ROUTED]->(p:Plant)<-[:ROUTED]-(f2:Field)<-[:OPERATES]-(g2:Grower)
        WHERE g1.id != g2.id AND (f2.submissionStatus = 'Flagged' OR f2.submissionStatus = 'Pending')
        RETURN g1.id AS g1_id
      )
    )
    LIMIT 1
  `;
  const [cleanGrowerRows] = await bigquery.query(cleanGrowerQuery);
  const cleanGrowerId = cleanGrowerRows.length > 0 ? cleanGrowerRows[0].growerId : null;
  console.log(`Discovered grower without neighboring anomalies: ${cleanGrowerId || 'NONE FOUND'}`);

  // 3. Get expected warnings for the main growerId from BigQuery to verify Tier 4
  const warningsQuery = `
    SELECT DISTINCT
      growerId, growerName, fieldId, fieldName, status
    FROM GRAPH_TABLE(
      agriflow.supply_chain_graph
      MATCH (g1:Grower)-[:OPERATES]->(f1:Field)-[:ROUTED]->(p:Plant)<-[:ROUTED]-(f2:Field)<-[:OPERATES]-(g2:Grower)
      WHERE g1.id = @growerId AND g2.id != @growerId AND (f2.submissionStatus = 'Flagged' OR f2.submissionStatus = 'Pending')
      RETURN g2.id AS growerId, g2.growerName AS growerName, f2.id AS fieldId, f2.fieldName AS fieldName, f2.submissionStatus AS status
    )
  `;
  const [expectedWarnings] = await bigquery.query({
    query: warningsQuery,
    params: { growerId: testChain.growerId }
  });
  console.log(`Discovered ${expectedWarnings.length} expected neighboring grower warnings for ${testChain.growerId}`);

  return {
    ...testChain,
    cleanGrowerId,
    expectedWarnings
  };
}

function printResult(tier, name, success, message = '') {
  const symbol = success ? '✅' : '❌';
  console.log(`${symbol} [${tier}] ${name} ${message ? `- ${message}` : ''}`);
}

async function runTests(testData) {
  console.log("\n==================================================");
  console.log("Running E2E Test Suite for Lineage Trace");
  console.log("==================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  const testLineageEndpoint = async (nodeId) => {
    const url = `http://localhost:3001/api/analytics/lineage?nodeId=${nodeId}`;
    const res = await fetch(url);
    if (res.status !== 200) {
      throw new Error(`API returned status ${res.status}`);
    }
    const data = await res.json();
    return data;
  };

  // --- Tier 1: Feature Coverage ---
  console.log("--- Tier 1: Feature Coverage ---");
  const nodeTypes = ['agronomist', 'grower', 'field', 'plant'];
  const testIds = {
    agronomist: testData.agronomistId,
    grower: testData.growerId,
    field: testData.fieldId,
    plant: testData.plantId
  };

  for (const type of nodeTypes) {
    totalTests++;
    try {
      const data = await testLineageEndpoint(testIds[type]);
      
      const schemaValid = Array.isArray(data.nodes) && Array.isArray(data.links) && Array.isArray(data.warnings);
      let nodesValid = true;
      if (schemaValid) {
        for (const n of data.nodes) {
          if (!n.id || !n.label || !n.type) {
            nodesValid = false;
            break;
          }
        }
      }
      
      if (schemaValid && nodesValid) {
        passedTests++;
        printResult("Tier 1", `Trace ${type} node: ${testIds[type]}`, true);
      } else {
        printResult("Tier 1", `Trace ${type} node: ${testIds[type]}`, false, `Schema validation failed. SchemaValid: ${schemaValid}, NodesValid: ${nodesValid}`);
      }
    } catch (err) {
      printResult("Tier 1", `Trace ${type} node: ${testIds[type]}`, false, err.message);
    }
  }

  // --- Tier 2: Boundary & Corner Cases ---
  console.log("\n--- Tier 2: Boundary & Corner Cases ---");
  
  // 2a. Missing nodeId query parameter
  totalTests++;
  try {
    const res = await fetch('http://localhost:3001/api/analytics/lineage');
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 2", "Missing nodeId parameter returns 400 Bad Request", true);
    } else {
      printResult("Tier 2", "Missing nodeId parameter returns 400 Bad Request", false, `Status returned: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Missing nodeId parameter returns 400 Bad Request", false, err.message);
  }

  // 2b. Invalid node ID format
  totalTests++;
  try {
    const res = await fetch('http://localhost:3001/api/analytics/lineage?nodeId=invalid-id-format');
    if (res.status === 400 || res.status === 404) {
      passedTests++;
      printResult("Tier 2", "Invalid node ID returns error status (400 or 404)", true);
    } else if (res.status === 200) {
      const data = await res.json();
      if (data.nodes.length === 0 && data.links.length === 0) {
        passedTests++;
        printResult("Tier 2", "Invalid node ID returns 200 with empty result", true);
      } else {
        printResult("Tier 2", "Invalid node ID returns 200 but content is not empty", false);
      }
    } else {
      printResult("Tier 2", "Invalid node ID", false, `Server returned unexpected status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Invalid node ID", false, err.message);
  }

  // 2c. Cases where no anomalies/warnings exist
  if (testData.cleanGrowerId) {
    totalTests++;
    try {
      const data = await testLineageEndpoint(testData.cleanGrowerId);
      if (Array.isArray(data.warnings) && data.warnings.length === 0) {
        passedTests++;
        printResult("Tier 2", `Grower with no warnings returns empty warnings array`, true);
      } else {
        printResult("Tier 2", `Grower with no warnings returns empty warnings array`, false, `Warnings length: ${data.warnings?.length}`);
      }
    } catch (err) {
      printResult("Tier 2", `Grower with no warnings returns empty warnings array`, false, err.message);
    }
  } else {
    console.log("Skipping Tier 2c (Grower with no warnings) because no clean grower was found in BQ.");
  }

  // 2d. fieldId query parameter instead of nodeId
  totalTests++;
  try {
    const res = await fetch(`http://localhost:3001/api/analytics/lineage?fieldId=${testData.fieldId}`);
    if (res.status === 200) {
      const data = await res.json();
      const schemaValid = Array.isArray(data.nodes) && Array.isArray(data.links);
      const containsField = data.nodes.some(n => n.id === testData.fieldId);
      if (schemaValid && containsField) {
        passedTests++;
        printResult("Tier 2", `fieldId parameter routing: ${testData.fieldId}`, true);
      } else {
        printResult("Tier 2", `fieldId parameter routing: ${testData.fieldId}`, false, `SchemaValid: ${schemaValid}, ContainsField: ${containsField}`);
      }
    } else {
      printResult("Tier 2", `fieldId parameter routing`, false, `Status returned: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", `fieldId parameter routing`, false, err.message);
  }

  // 2e. Both nodeId and fieldId parameters present (nodeId should take priority)
  totalTests++;
  try {
    const res = await fetch(`http://localhost:3001/api/analytics/lineage?nodeId=${testData.growerId}&fieldId=${testData.fieldId}`);
    if (res.status === 200) {
      const data = await res.json();
      const containsGrower = data.nodes.some(n => n.id === testData.growerId);
      if (containsGrower) {
        passedTests++;
        printResult("Tier 2", `Parameter precedence (nodeId priority)`, true);
      } else {
        printResult("Tier 2", `Parameter precedence (nodeId priority)`, false, `Grower node not found in trace`);
      }
    } else {
      printResult("Tier 2", `Parameter precedence`, false, `Status returned: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", `Parameter precedence`, false, err.message);
  }

  // --- Tier 3: Cross-Feature Combinations ---
  console.log("\n--- Tier 3: Cross-Feature Combinations ---");
  
  // Tracing lineage of grower vs tracing lineage of grower's field, ensuring subset relationship
  totalTests++;
  try {
    const growerData = await testLineageEndpoint(testData.growerId);
    const fieldData = await testLineageEndpoint(testData.fieldId);
    
    const growerNodeIds = new Set(growerData.nodes.map(n => n.id));
    const fieldNodeIds = new Set(fieldData.nodes.map(n => n.id));
    
    let isSubset = true;
    for (const id of fieldNodeIds) {
      if (!growerNodeIds.has(id)) {
        isSubset = false;
        break;
      }
    }
    
    const containsPlant = growerNodeIds.has(testData.plantId) && fieldNodeIds.has(testData.plantId);
    
    if (isSubset && containsPlant) {
      passedTests++;
      printResult("Tier 3", "Field lineage is a subset of Grower lineage & both contain matching Plant node", true);
    } else {
      printResult("Tier 3", "Field lineage is a subset of Grower lineage & both contain matching Plant node", false, `IsSubset: ${isSubset}, ContainsPlant: ${containsPlant}`);
    }
  } catch (err) {
    printResult("Tier 3", "Field lineage is a subset of Grower lineage", false, err.message);
  }

  // --- Tier 4: Real-world Workload & DB Verification ---
  console.log("\n--- Tier 4: Real-world Workload ---");
  
  // Tracing Agronomist node, confirm it routes to the correct growers, fields, and plants, and check if neighboring grower anomalies match verified DB state
  totalTests++;
  try {
    const agroData = await testLineageEndpoint(testData.agronomistId);
    
    const nodeIds = new Set(agroData.nodes.map(n => n.id));
    const routesCorrectly = nodeIds.has(testData.agronomistId) && 
                            nodeIds.has(testData.growerId) && 
                            nodeIds.has(testData.fieldId) && 
                            nodeIds.has(testData.plantId);
                            
    if (routesCorrectly) {
      passedTests++;
      printResult("Tier 4", "Agronomist trace routes to correct downstream grower, field, and plant", true);
    } else {
      printResult("Tier 4", "Agronomist trace routes to correct downstream grower, field, and plant", false, `Missing nodes: Agronomist: ${nodeIds.has(testData.agronomistId)}, Grower: ${nodeIds.has(testData.growerId)}, Field: ${nodeIds.has(testData.fieldId)}, Plant: ${nodeIds.has(testData.plantId)}`);
    }
  } catch (err) {
    printResult("Tier 4", "Agronomist trace routing", false, err.message);
  }

  // Verification of neighboring grower warnings against DB state
  totalTests++;
  try {
    const growerData = await testLineageEndpoint(testData.growerId);
    const apiWarnings = growerData.warnings || [];
    
    // Sort both to compare
    const sortedApi = [...apiWarnings].sort((a, b) => a.growerId.localeCompare(b.growerId) || a.fieldId.localeCompare(b.fieldId));
    const sortedDb = [...testData.expectedWarnings].sort((a, b) => a.growerId.localeCompare(b.growerId) || a.fieldId.localeCompare(b.fieldId));
    
    let match = sortedApi.length === sortedDb.length;
    if (match) {
      for (let i = 0; i < sortedApi.length; i++) {
        if (sortedApi[i].growerId !== sortedDb[i].growerId || 
            sortedApi[i].fieldId !== sortedDb[i].fieldId || 
            sortedApi[i].status !== sortedDb[i].status) {
          match = false;
          break;
        }
      }
    }
    
    if (match) {
      passedTests++;
      printResult("Tier 4", "Neighboring grower warnings match verified BigQuery database state", true);
    } else {
      printResult("Tier 4", "Neighboring grower warnings match verified BigQuery database state", false, `API warnings count: ${sortedApi.length}, DB warnings count: ${sortedDb.length}`);
    }
  } catch (err) {
    printResult("Tier 4", "Neighboring grower warnings match DB state", false, err.message);
  }

  // --- Tier 5: Adversarial Hardening ---
  console.log("\n--- Tier 5: Adversarial Hardening ---");

  // 5a. SQL Injection payload in nodeId
  totalTests++;
  try {
    const sqlPayload = "grower-'; SELECT * FROM agriflow.supply_chain_graph;--";
    const res = await fetch(`http://localhost:3001/api/analytics/lineage?nodeId=${encodeURIComponent(sqlPayload)}`);
    if (res.status === 200) {
      const data = await res.json();
      if (data.nodes.length === 0 && data.links.length === 0) {
        passedTests++;
        printResult("Tier 5", "SQL Injection payload handled safely (no execution/empty results)", true);
      } else {
        printResult("Tier 5", "SQL Injection payload handled safely", false, `Returned non-empty results: ${data.nodes.length} nodes`);
      }
    } else {
      printResult("Tier 5", "SQL Injection payload handled safely", false, `Status returned: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "SQL Injection payload handled safely", false, err.message);
  }

  // 5b. Wildcard characters
  totalTests++;
  try {
    const res = await fetch(`http://localhost:3001/api/analytics/lineage?nodeId=grower-%25`);
    if (res.status === 200) {
      const data = await res.json();
      if (data.nodes.length === 0 && data.links.length === 0) {
        passedTests++;
        printResult("Tier 5", "Wildcard character (%) matched literally (empty results)", true);
      } else {
        printResult("Tier 5", "Wildcard character (%) matched literally", false, `Returned non-empty results`);
      }
    } else {
      printResult("Tier 5", "Wildcard character (%) matched literally", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "Wildcard character (%) matched literally", false, err.message);
  }

  // 5c. Oversized input parameter
  totalTests++;
  try {
    const oversizedId = 'agro-' + 'A'.repeat(5000);
    const res = await fetch(`http://localhost:3001/api/analytics/lineage?nodeId=${oversizedId}`);
    if (res.status === 200) {
      const data = await res.json();
      if (data.nodes.length === 0 && data.links.length === 0) {
        passedTests++;
        printResult("Tier 5", "Oversized parameter handled safely (empty results)", true);
      } else {
        printResult("Tier 5", "Oversized parameter handled safely", false, `Returned non-empty results`);
      }
    } else {
      printResult("Tier 5", "Oversized parameter handled safely", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "Oversized parameter handled safely", false, err.message);
  }

  // 5e. UI-Formatted Field ID Trace
  totalTests++;
  try {
    const uiFieldId = `field-${testData.fieldName.replace(/\s+/g, '-')}`;
    const data = await testLineageEndpoint(uiFieldId);
    const containsField = data.nodes && data.nodes.some(n => n.label === testData.fieldName);
    if (containsField && data.nodes.length > 0) {
      passedTests++;
      printResult("Tier 5", `UI-Formatted Field ID Trace matches by fieldName: ${uiFieldId}`, true);
    } else {
      printResult("Tier 5", `UI-Formatted Field ID Trace matches by fieldName: ${uiFieldId}`, false, `Empty results or field node not found in nodes: ${JSON.stringify(data?.nodes)}`);
    }
  } catch (err) {
    printResult("Tier 5", `UI-Formatted Field ID Trace matches by fieldName`, false, err.message);
  }

  // 5f. Whitespace-only parameter validation
  totalTests++;
  try {
    const res = await fetch('http://localhost:3001/api/analytics/lineage?nodeId=%20%20%20');
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 5", "Whitespace-only nodeId parameter returns 400 Bad Request", true);
    } else {
      printResult("Tier 5", "Whitespace-only nodeId parameter returns 400 Bad Request", false, `Status returned: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "Whitespace-only nodeId parameter returns 400 Bad Request", false, err.message);
  }

  // 5g. Empty-prefix parameter validation
  totalTests++;
  try {
    const res = await fetch('http://localhost:3001/api/analytics/lineage?nodeId=agro-');
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 5", "Empty-prefix nodeId (agro-) returns 400 Bad Request", true);
    } else if (res.status === 200) {
      const data = await res.json();
      if (data.nodes && data.nodes.length === 0 && data.links && data.links.length === 0) {
        // We will report this as a failure because we target a strict 400 bad request, but let's see what happens.
        printResult("Tier 5", "Empty-prefix nodeId (agro-) returns 400 Bad Request", false, `Returned 200 with empty data instead of 400`);
      } else {
        printResult("Tier 5", "Empty-prefix nodeId (agro-) returns 400 Bad Request", false, `Returned 200 with data: ${data?.nodes?.length} nodes`);
      }
    } else {
      printResult("Tier 5", "Empty-prefix nodeId (agro-) returns 400 Bad Request", false, `Status returned: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "Empty-prefix nodeId (agro-) returns 400 Bad Request", false, err.message);
  }

  // 5h. Cypher-specific special characters
  totalTests++;
  try {
    const maliciousId = "grower-()-[:OPERATES]->{}";
    const res = await fetch(`http://localhost:3001/api/analytics/lineage?nodeId=${encodeURIComponent(maliciousId)}`);
    if (res.status === 200) {
      const data = await res.json();
      if (data.nodes && data.nodes.length === 0 && data.links && data.links.length === 0) {
        passedTests++;
        printResult("Tier 5", "Cypher-specific special characters handled safely", true);
      } else {
        printResult("Tier 5", "Cypher-specific special characters handled safely", false, `Returned non-empty results`);
      }
    } else {
      printResult("Tier 5", "Cypher-specific special characters handled safely", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "Cypher-specific special characters handled safely", false, err.message);
  }

  // 5i. Concurrent requests stress test
  totalTests++;
  try {
    const requests = Array.from({ length: 15 }, () => 
      fetch(`http://localhost:3001/api/analytics/lineage?nodeId=${testData.growerId}`)
    );
    const responses = await Promise.all(requests);
    const allSuccessful = responses.every(r => r.status === 200);
    if (allSuccessful) {
      passedTests++;
      printResult("Tier 5", "15 concurrent requests resolved successfully", true);
    } else {
      const statuses = responses.map(r => r.status);
      printResult("Tier 5", "15 concurrent requests resolved successfully", false, `Some requests failed. Statuses: ${JSON.stringify(statuses)}`);
    }
  } catch (err) {
    printResult("Tier 5", "15 concurrent requests resolved successfully", false, err.message);
  }

  console.log("\n==================================================");
  console.log(`Test Summary: ${passedTests} / ${totalTests} passed`);
  console.log("==================================================\n");

  if (passedTests < totalTests) {
    throw new Error("One or more E2E tests failed.");
  }
}

async function runFailureModeTest(testData) {
  console.log("\n--- Tier 5d: Database Failure Mode (Robustness) ---");
  
  // Stop normal server
  stopServer();
  await sleep(1500);
  
  // Start server with invalid credentials
  console.log("Starting Next.js server in DATABASE FAILURE MODE...");
  const failureServerProcess = spawn('npx', ['next', 'dev', '-p', '3001'], {
    stdio: 'ignore',
    shell: true,
    env: { 
      ...process.env, 
      GOOGLE_APPLICATION_CREDENTIALS: '/nonexistent-file.json',
      GOOGLE_API_KEY: '',
      GCLOUD_PROJECT: 'invalid-project-id'
    }
  });
  
  // Wait for server to become responsive
  const maxAttempts = 30;
  let ready = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('http://localhost:3001/api/graph');
      if (res.status === 200 || res.status === 404 || res.status === 500) {
        ready = true;
        break;
      }
    } catch (err) {
      // Server not ready yet
    }
    await sleep(1000);
  }
  
  if (!ready) {
    try { failureServerProcess.kill('SIGTERM'); } catch(e){}
    throw new Error("Failure-mode server failed to start within 30 seconds");
  }

  let success = false;
  let statusReturned = 0;
  let responseData = null;
  try {
    const res = await fetch(`http://localhost:3001/api/analytics/lineage?nodeId=${testData.growerId}`);
    statusReturned = res.status;
    responseData = await res.json();
    if (res.status === 500 && responseData.error === 'Server error') {
      success = true;
    }
  } catch (err) {
    console.error("Fetch error during failure mode test:", err.message);
  } finally {
    console.log("Stopping failure-mode Next.js server...");
    try {
      failureServerProcess.kill('SIGTERM');
    } catch (err) {
      console.error("Error killing failure mode server:", err.message);
    }
    await sleep(1500);
  }
  
  const symbol = success ? '✅' : '❌';
  console.log(`${symbol} [Tier 5d] DB query failure returns 500 with error message - Status: ${statusReturned}, error: ${responseData?.error || 'none'}`);
  return success;
}

async function main() {
  try {
    const testData = await discoverTestData();
    await startServer();
    await runTests(testData);
    const failurePassed = await runFailureModeTest(testData);
    if (!failurePassed) {
      throw new Error("Failure mode robustness test failed.");
    }
  } catch (err) {
    console.error("\n❌ E2E Test Suite Run Failed:", err.message);
    process.exitCode = 1;
  } finally {
    stopServer();
  }
}

main();
