const { BigQuery } = require('@google-cloud/bigquery');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const bigquery = new BigQuery({ projectId: 'jamie-bq-test' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let serverProcess = null;

async function startServer(envOverride = {}) {
  console.log("Starting Next.js server on port 3002...");
  serverProcess = spawn('npx', ['next', 'dev', '-p', '3002'], {
    stdio: 'ignore', // Suppress logs
    shell: true,
    env: {
      ...process.env,
      ...envOverride
    }
  });

  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('http://localhost:3002/');
      if (res.status) {
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
    serverProcess = null;
  }
}

async function discoverTestData() {
  console.log("Discovering fields from BigQuery database...");

  // 1. Find a flagged field using GRAPH_TABLE
  const flaggedQuery = `
    SELECT DISTINCT fieldName 
    FROM GRAPH_TABLE(
      agriflow.supply_chain_graph
      MATCH (f:Field)
      RETURN f.fieldName AS fieldName, f.submissionStatus AS submissionStatus
    )
    WHERE submissionStatus = 'Flagged'
    LIMIT 1
  `;
  const [flaggedRows] = await bigquery.query(flaggedQuery);
  const flaggedField = flaggedRows.length > 0 ? flaggedRows[0].fieldName : 'Field-111';

  // 2. Find a clean field using GRAPH_TABLE
  const cleanQuery = `
    SELECT DISTINCT fieldName 
    FROM GRAPH_TABLE(
      agriflow.supply_chain_graph
      MATCH (f:Field)
      RETURN f.fieldName AS fieldName, f.submissionStatus AS submissionStatus
    )
    WHERE fieldName NOT IN (
      SELECT DISTINCT fieldName 
      FROM GRAPH_TABLE(
        agriflow.supply_chain_graph
        MATCH (f:Field)
        RETURN f.fieldName AS fieldName, f.submissionStatus AS submissionStatus
      )
      WHERE submissionStatus = 'Flagged' OR submissionStatus = 'Pending'
    )
    LIMIT 1
  `;
  const [cleanRows] = await bigquery.query(cleanQuery);
  const cleanField = cleanRows.length > 0 ? cleanRows[0].fieldName : 'Field-103';

  console.log(`Discovered Test Data: Flagged Field = ${flaggedField}, Clean Field = ${cleanField}`);
  return { flaggedField, cleanField };
}

function printResult(tier, name, success, message = '') {
  const symbol = success ? '✅' : '❌';
  console.log(`${symbol} [${tier}] ${name} ${message ? `- ${message}` : ''}`);
}

async function runStaticUiChecks() {
  console.log("\n--- UI Static Code Inspection ---");
  let passed = true;
  
  const uiFilePath = path.join(process.cwd(), 'src/components/InteractiveGraph.jsx');
  if (!fs.existsSync(uiFilePath)) {
    printResult("UI Static", "InteractiveGraph.jsx exists", false, "File not found");
    return false;
  }
  
  const content = fs.readFileSync(uiFilePath, 'utf8');

  // Verify UI scorecard components
  const hasScorecard = content.includes('Scorecard') || content.includes('score') || content.includes('advisory');
  printResult("UI Static", "Verify UI scorecard components", hasScorecard, hasScorecard ? "Found scorecard components" : "Missing scorecard/advisory UI code");
  if (!hasScorecard) passed = false;

  // Verify checklists
  const hasChecklist = content.includes('checklist') || content.includes('Checklist') || content.includes('compliance') || content.includes('status');
  printResult("UI Static", "Verify checklist elements", hasChecklist, hasChecklist ? "Found checklist elements" : "Missing checklist/compliance elements");
  if (!hasChecklist) passed = false;

  // Verify color badge styling (green/yellow/red)
  const hasBadgeColors = (content.includes('green') || content.includes('#10b981')) && 
                         (content.includes('yellow') || content.includes('amber') || content.includes('#f59e0b')) && 
                         (content.includes('red') || content.includes('#ef4444'));
  printResult("UI Static", "Verify color badge styling (green/yellow/red)", hasBadgeColors, hasBadgeColors ? "Found badge color styling" : "Missing green/yellow/red badge styles");
  if (!hasBadgeColors) passed = false;

  // Verify sparkles icon
  const hasSparkles = content.includes('Sparkles');
  printResult("UI Static", "Verify sparkles icon", hasSparkles, hasSparkles ? "Found Sparkles icon" : "Missing Sparkles icon");
  if (!hasSparkles) passed = false;

  // Verify loading state spinner
  const hasSpinner = content.includes('isHolisticLoading') || content.includes('loading') || content.includes('Loader2');
  printResult("UI Static", "Verify loading state spinner", hasSpinner, hasSpinner ? "Found loading state logic" : "Missing loading spinner/state logic");
  if (!hasSpinner) passed = false;

  // Verify refresh button trigger logic
  const hasRefresh = content.includes('RefreshCw') || content.includes('refresh') || content.includes('handleRefresh') || content.includes('trigger');
  printResult("UI Static", "Verify refresh button trigger logic", hasRefresh, hasRefresh ? "Found refresh button trigger logic" : "Missing refresh button trigger logic");
  if (!hasRefresh) passed = false;

  return passed;
}

async function runApiTests(testData) {
  let totalTests = 0;
  let passedTests = 0;

  const testEndpoint = async (params) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`http://localhost:3002/api/analytics/holistic-health?${query}`);
    return res;
  };

  // --- Tier 1: Feature Coverage ---
  console.log("\n--- Tier 1: Feature Coverage ---");
  
  // Test 1a: Clean Field Feature Coverage
  totalTests++;
  try {
    const res = await testEndpoint({
      fieldName: testData.cleanField,
      ndvi: '0.85',
      soilMoisture: '22.5'
    });
    
    if (res.status === 200) {
      const data = await res.json();
      const hasScore = typeof data.score === 'string' && ['A', 'B', 'C', 'D', 'F'].includes(data.score);
      const hasAdvisory = typeof data.advisory === 'string' && data.advisory.trim().length > 0;
      
      if (hasScore && hasAdvisory) {
        passedTests++;
        printResult("Tier 1", `Valid holistic health query for clean field ${testData.cleanField}`, true, `Score: ${data.score}, Advisory: "${data.advisory}"`);
      } else {
        printResult("Tier 1", `Valid holistic health query for clean field ${testData.cleanField}`, false, `Response schema invalid: score=${data.score}, advisory=${data.advisory}`);
      }
    } else {
      printResult("Tier 1", `Valid holistic health query for clean field ${testData.cleanField}`, false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 1", `Valid holistic health query for clean field ${testData.cleanField}`, false, err.message);
  }

  // --- Tier 2: Boundary & Corner Cases ---
  console.log("\n--- Tier 2: Boundary & Corner Cases ---");
  
  // 2a. Missing fieldName
  totalTests++;
  try {
    const res = await testEndpoint({ ndvi: '0.85', soilMoisture: '22.5' });
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 2", "Missing fieldName returns 400 Bad Request", true);
    } else {
      printResult("Tier 2", "Missing fieldName returns 400 Bad Request", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Missing fieldName returns 400 Bad Request", false, err.message);
  }

  // 2b. Missing ndvi
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: testData.cleanField, soilMoisture: '22.5' });
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 2", "Missing ndvi returns 400 Bad Request", true);
    } else {
      printResult("Tier 2", "Missing ndvi returns 400 Bad Request", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Missing ndvi returns 400 Bad Request", false, err.message);
  }

  // 2c. Missing soilMoisture
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: testData.cleanField, ndvi: '0.85' });
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 2", "Missing soilMoisture returns 400 Bad Request", true);
    } else {
      printResult("Tier 2", "Missing soilMoisture returns 400 Bad Request", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Missing soilMoisture returns 400 Bad Request", false, err.message);
  }

  // 2d. Invalid format (non-numeric ndvi)
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: testData.cleanField, ndvi: 'abc', soilMoisture: '22.5' });
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 2", "Invalid ndvi format (non-numeric) returns 400 Bad Request", true);
    } else {
      printResult("Tier 2", "Invalid ndvi format (non-numeric) returns 400 Bad Request", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Invalid ndvi format (non-numeric) returns 400 Bad Request", false, err.message);
  }

  // 2e. Out-of-bounds input: NDVI > 1.0
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: testData.cleanField, ndvi: '1.5', soilMoisture: '22.5' });
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 2", "Out-of-bounds NDVI (> 1.0) returns 400 Bad Request", true);
    } else {
      printResult("Tier 2", "Out-of-bounds NDVI (> 1.0) returns 400 Bad Request", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Out-of-bounds NDVI (> 1.0) returns 400 Bad Request", false, err.message);
  }

  // 2f. Out-of-bounds input: Soil Moisture < 0%
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: testData.cleanField, ndvi: '0.85', soilMoisture: '-10' });
    if (res.status === 400) {
      passedTests++;
      printResult("Tier 2", "Out-of-bounds soil moisture (< 0) returns 400 Bad Request", true);
    } else {
      printResult("Tier 2", "Out-of-bounds soil moisture (< 0) returns 400 Bad Request", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Out-of-bounds soil moisture (< 0) returns 400 Bad Request", false, err.message);
  }

  // 2g. Nonexistent field
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: 'NonexistentField123456', ndvi: '0.85', soilMoisture: '22.5' });
    if (res.status === 404) {
      passedTests++;
      printResult("Tier 2", "Nonexistent field name returns 404 Not Found", true);
    } else {
      printResult("Tier 2", "Nonexistent field name returns 404 Not Found", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 2", "Nonexistent field name returns 404 Not Found", false, err.message);
  }

  // --- Tier 3: Cross-Feature Combinations ---
  console.log("\n--- Tier 3: Cross-Feature Combinations ---");

  // 3a. Low NDVI (< 0.60) via Gemini
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: testData.cleanField, ndvi: '0.50', soilMoisture: '20.0' });
    if (res.status === 200) {
      const data = await res.json();
      const hasGrade = ['A', 'B', 'C', 'D', 'F'].includes(data.score);
      const hasAdvisory = typeof data.advisory === 'string' && data.advisory.trim().length > 0;
      
      if (hasGrade && hasAdvisory) {
        passedTests++;
        printResult("Tier 3", "Low NDVI (< 0.60) returns valid grade and advisory via Gemini", true, `Grade: ${data.score}, Advisory: "${data.advisory}"`);
      } else {
        printResult("Tier 3", "Low NDVI (< 0.60) returns valid grade and advisory via Gemini", false, `Grade: ${data.score}, Advisory: "${data.advisory}"`);
      }
    } else {
      printResult("Tier 3", "Low NDVI query failed", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 3", "Low NDVI query failed", false, err.message);
  }

  // 3b. Dry Soil (< 15.0%) via Gemini
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: testData.cleanField, ndvi: '0.85', soilMoisture: '12.0' });
    if (res.status === 200) {
      const data = await res.json();
      const hasGrade = ['A', 'B', 'C', 'D', 'F'].includes(data.score);
      const hasAdvisory = typeof data.advisory === 'string' && data.advisory.trim().length > 0;
      
      if (hasGrade && hasAdvisory) {
        passedTests++;
        printResult("Tier 3", "Dry Soil (< 15%) returns valid grade and advisory via Gemini", true, `Grade: ${data.score}, Advisory: "${data.advisory}"`);
      } else {
        printResult("Tier 3", "Dry Soil (< 15%) returns valid grade and advisory via Gemini", false, `Grade: ${data.score}, Advisory: "${data.advisory}"`);
      }
    } else {
      printResult("Tier 3", "Dry Soil query failed", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 3", "Dry Soil query failed", false, err.message);
  }

  // --- Tier 4: Real-world Workload ---
  console.log("\n--- Tier 4: Real-world Workload ---");

  // 4a. Flagged field query compares to compliance warnings in DB
  totalTests++;
  try {
    const res = await testEndpoint({ fieldName: testData.flaggedField, ndvi: '0.85', soilMoisture: '22.5' });
    if (res.status === 200) {
      const data = await res.json();
      const isWarningOrPoorGrade = ['C', 'D', 'F'].includes(data.score);
      const isComplianceAdvisory = data.advisory.toLowerCase().includes('compliance') || 
                                   data.advisory.toLowerCase().includes('flagged') || 
                                   data.advisory.toLowerCase().includes('defect') || 
                                   data.advisory.toLowerCase().includes('moisture') || 
                                   data.advisory.toLowerCase().includes('warning') || 
                                   data.advisory.toLowerCase().includes('anomaly');
      
      if (isWarningOrPoorGrade && isComplianceAdvisory) {
        passedTests++;
        printResult("Tier 4", `Flagged field query for ${testData.flaggedField} returns poor/warning compliance grade/advisory`, true, `Grade: ${data.score}, Advisory: "${data.advisory}"`);
      } else {
        printResult("Tier 4", `Flagged field query for ${testData.flaggedField} returns poor/warning compliance grade/advisory`, false, `Grade: ${data.score}, Advisory: "${data.advisory}" (WarningOrPoorGrade: ${isWarningOrPoorGrade}, ComplianceAdvisory: ${isComplianceAdvisory})`);
      }
    } else {
      printResult("Tier 4", `Flagged field query`, false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 4", `Flagged field query`, false, err.message);
  }

  // --- Tier 5: Adversarial Hardening ---
  console.log("\n--- Tier 5: Adversarial Hardening ---");

  // 5a. SQL Injection payload in fieldName
  totalTests++;
  try {
    const sqlPayload = "Field-103'; SELECT * FROM agriflow.fields;--";
    const res = await testEndpoint({ fieldName: sqlPayload, ndvi: '0.85', soilMoisture: '22.5' });
    if (res.status === 400 || res.status === 404) {
      passedTests++;
      printResult("Tier 5", "SQL Injection payload handled safely (status 400 or 404)", true);
    } else if (res.status === 200) {
      const data = await res.json();
      if (data.score === 'F' || !data.score) {
        passedTests++;
        printResult("Tier 5", "SQL Injection payload handled safely (status 200 fallback/empty)", true);
      } else {
        printResult("Tier 5", "SQL Injection payload handled safely", false, `Returned success score ${data.score} for malicious query`);
      }
    } else {
      printResult("Tier 5", "SQL Injection payload handled safely", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "SQL Injection payload handled safely", false, err.message);
  }

  // 5b. XSS/Script tag payload in fieldName
  totalTests++;
  try {
    const xssPayload = "<script>alert('xss')</script>";
    const res = await testEndpoint({ fieldName: xssPayload, ndvi: '0.85', soilMoisture: '22.5' });
    if (res.status === 400 || res.status === 404) {
      passedTests++;
      printResult("Tier 5", "XSS script tag payload handled safely (status 400 or 404)", true);
    } else if (res.status === 200) {
      const data = await res.json();
      if (!data.advisory.includes('<script>')) {
        passedTests++;
        printResult("Tier 5", "XSS script tag payload sanitized or ignored in response", true);
      } else {
        printResult("Tier 5", "XSS script tag payload sanitized or ignored in response", false, `Advisory reflects unescaped script: "${data.advisory}"`);
      }
    } else {
      printResult("Tier 5", "XSS script tag handled safely", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "XSS script tag handled safely", false, err.message);
  }

  // 5c. Oversized fieldName parameter
  totalTests++;
  try {
    const oversizedFieldName = 'Field-' + 'A'.repeat(5000);
    const res = await testEndpoint({ fieldName: oversizedFieldName, ndvi: '0.85', soilMoisture: '22.5' });
    if (res.status === 400 || res.status === 404) {
      passedTests++;
      printResult("Tier 5", "Oversized fieldName handled safely (status 400 or 404)", true);
    } else if (res.status === 200) {
      passedTests++;
      printResult("Tier 5", "Oversized fieldName handled safely (status 200 safe empty/fallback)", true);
    } else {
      printResult("Tier 5", "Oversized fieldName handled safely", false, `Status: ${res.status}`);
    }
  } catch (err) {
    printResult("Tier 5", "Oversized fieldName handled safely", false, err.message);
  }

  return { totalTests, passedTests };
}

async function runVertexFailureModeTest(testData) {
  console.log("\n--- Tier 5d: Vertex AI Credentials Failure Mode & Heuristics ---");
  
  // Restart Next.js dev server on 3002 with invalid/fake vertex credentials to force fallback engine
  stopServer();
  await sleep(1500);

  console.log("Starting Next.js server in VERTEX FAILURE MODE (Fake Credentials)...");
  await startServer({
    GCP_PROJECT_ID: 'invalid-project-id-to-force-vertex-failure',
    GCP_REGION: 'invalid-region'
  });

  let allPassed = true;

  const testFallback = async (params) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`http://localhost:3002/api/analytics/holistic-health?${query}`);
    if (res.status !== 200) {
      throw new Error(`API returned status ${res.status}`);
    }
    return await res.json();
  };

  // Heuristic 1: Optimal conditions
  try {
    const data = await testFallback({ fieldName: testData.cleanField, ndvi: '0.85', soilMoisture: '22.5' });
    const success = data.score === 'A' && data.advisory.toLowerCase().includes('optimal');
    printResult("Tier 5d Fallback", "Heuristic 1: Optimal conditions (A)", success, `Score: ${data.score}, Advisory: "${data.advisory}"`);
    if (!success) allPassed = false;
  } catch (err) {
    printResult("Tier 5d Fallback", "Heuristic 1: Optimal conditions (A)", false, err.message);
    allPassed = false;
  }

  // Heuristic 2: Low NDVI (< 0.60)
  try {
    const data = await testFallback({ fieldName: testData.cleanField, ndvi: '0.50', soilMoisture: '22.5' });
    const success = ['C', 'D'].includes(data.score) && 
                    (data.advisory.toLowerCase().includes('stress') || data.advisory.toLowerCase().includes('vegetation') || data.advisory.toLowerCase().includes('ndvi'));
    printResult("Tier 5d Fallback", "Heuristic 2: Low NDVI (C/D)", success, `Score: ${data.score}, Advisory: "${data.advisory}"`);
    if (!success) allPassed = false;
  } catch (err) {
    printResult("Tier 5d Fallback", "Heuristic 2: Low NDVI (C/D)", false, err.message);
    allPassed = false;
  }

  // Heuristic 3: Dry Soil (< 15.0%)
  try {
    const data = await testFallback({ fieldName: testData.cleanField, ndvi: '0.85', soilMoisture: '12.0' });
    const success = ['C', 'D'].includes(data.score) && 
                    (data.advisory.toLowerCase().includes('dry') || data.advisory.toLowerCase().includes('moisture') || data.advisory.toLowerCase().includes('irrigation') || data.advisory.toLowerCase().includes('water'));
    printResult("Tier 5d Fallback", "Heuristic 3: Dry Soil (C/D)", success, `Score: ${data.score}, Advisory: "${data.advisory}"`);
    if (!success) allPassed = false;
  } catch (err) {
    printResult("Tier 5d Fallback", "Heuristic 3: Dry Soil (C/D)", false, err.message);
    allPassed = false;
  }

  // Heuristic 4: Flagged Field
  try {
    const data = await testFallback({ fieldName: testData.flaggedField, ndvi: '0.85', soilMoisture: '22.5' });
    const success = ['D', 'F'].includes(data.score) && 
                    (data.advisory.toLowerCase().includes('compliance') || data.advisory.toLowerCase().includes('flagged') || data.advisory.toLowerCase().includes('defect') || data.advisory.toLowerCase().includes('moisture'));
    printResult("Tier 5d Fallback", "Heuristic 4: Flagged Field (D/F)", success, `Score: ${data.score}, Advisory: "${data.advisory}"`);
    if (!success) allPassed = false;
  } catch (err) {
    printResult("Tier 5d Fallback", "Heuristic 4: Flagged Field (D/F)", false, err.message);
    allPassed = false;
  }

  stopServer();
  await sleep(1000);

  return allPassed;
}

async function main() {
  let hasFailures = false;
  let apiResults = { totalTests: 0, passedTests: 0 };
  let vertexFailurePassed = false;
  let staticChecksPassed = false;

  try {
    const testData = await discoverTestData();
    
    // Run UI checks statically first
    staticChecksPassed = await runStaticUiChecks();
    if (!staticChecksPassed) {
      hasFailures = true;
    }

    // Run active API tests
    await startServer();
    apiResults = await runApiTests(testData);
    if (apiResults.passedTests < apiResults.totalTests) {
      hasFailures = true;
    }

    // Run Vertex fallback engine test
    vertexFailurePassed = await runVertexFailureModeTest(testData);
    if (!vertexFailurePassed) {
      hasFailures = true;
    }

    console.log("\n==================================================");
    console.log(`Test Summary: ${apiResults.passedTests + (vertexFailurePassed ? 4 : 0) + (staticChecksPassed ? 6 : 0)} passed, total executed: ${apiResults.totalTests + 4 + 6}`);
    console.log("==================================================\n");

    if (hasFailures) {
      console.error("❌ Holistic Health E2E Test Suite Run Failed.");
      process.exitCode = 1;
    } else {
      console.log("✅ All Holistic Health E2E tests completed successfully!");
      process.exitCode = 0;
    }
  } catch (err) {
    console.error("\n❌ Fatal error running E2E Test Suite:", err.message);
    process.exitCode = 1;
  } finally {
    stopServer();
  }
}

main();
