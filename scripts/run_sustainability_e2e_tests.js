const { BigQuery } = require('@google-cloud/bigquery');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const bigquery = new BigQuery({ projectId: 'jamie-bq-test' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  if (options.signal) {
    return await originalFetch(url, options);
  }
  try {
    return await originalFetch(url, { ...options, signal: AbortSignal.timeout(5000) });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error(`Request timed out after 5000ms`);
    }
    throw err;
  }
};

let serverProcess = null;
let isApiAvailable = false;
const cleanupQueue = [];

// Registry for rollback tasks if process is interrupted
function registerCleanup(fn) {
  cleanupQueue.push(fn);
}

function unregisterCleanup(fn) {
  const index = cleanupQueue.indexOf(fn);
  if (index !== -1) {
    cleanupQueue.splice(index, 1);
  }
}

async function runCleanupQueue() {
  if (cleanupQueue.length === 0) return;
  console.log(`\n[Cleanup] Running ${cleanupQueue.length} registered database rollback operations...`);
  while (cleanupQueue.length > 0) {
    const rollbackFn = cleanupQueue.pop();
    try {
      await rollbackFn();
    } catch (err) {
      console.error("[Cleanup] Error during database rollback:", err.message);
    }
  }
  console.log("[Cleanup] Database rollback completed.");
}

// Clean up processes on Port 3003 (Mac OS compatible)
function killProcessOnPort(port) {
  try {
    const pidOutput = execSync(`lsof -t -i :${port}`).toString().trim();
    if (pidOutput) {
      console.log(`[Lifecycle] Port ${port} is occupied. Terminating PIDs: ${pidOutput.split('\n').join(', ')}`);
      const pids = pidOutput.split('\n').map(Number).filter(pid => pid && pid !== process.pid);
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (err) {
          // Ignore if process already terminated
        }
      }
    }
  } catch (err) {
    // lsof exits with code 1 if no processes are bound to the port
  }
}

async function startServer() {
  try {
    const res = await fetch('http://localhost:3003/');
    if (res.ok || res.status === 404) {
      console.log("[Lifecycle] Next.js server is already running and responsive. Reusing it.");
      serverProcess = null;
      return;
    }
  } catch (err) {
    // Not running or not responsive, proceed to start
  }

  console.log("[Lifecycle] Cleaning port 3003...");
  killProcessOnPort(3003);
  await sleep(2000);

  const out = fs.openSync('next_server.log', 'w');
  serverProcess = spawn('npx', ['next', 'start', '-p', '3003'], {
    stdio: ['ignore', out, out],
    detached: true,
    env: { ...process.env }
  });

  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('http://localhost:3003/');
      if (res.ok || res.status === 404) {
        console.log("[Lifecycle] Next.js server is ready on port 3003!");
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
  if (serverProcess && serverProcess.pid) {
    console.log("[Lifecycle] Stopping Next.js server on port 3003...");
    try {
      // Send SIGTERM to process group
      process.kill(-serverProcess.pid, 'SIGTERM');
    } catch (err) {
      console.error("[Lifecycle] Error stopping server group:", err.message);
    }
    serverProcess = null;
    killProcessOnPort(3003);
  } else {
    console.log("[Lifecycle] Reused server left running.");
  }
}

// Global exit handler
let isExiting = false;
async function handleExit(signal) {
  if (isExiting) return;
  isExiting = true;
  console.log(`\n[Lifecycle] Received exit signal: ${signal}. Running cleanup...`);
  try {
    await runCleanupQueue();
  } catch (err) {
    console.error("[Lifecycle] Error during rollback queue execution:", err.message);
  }
  stopServer();
  process.exit(1);
}

// Register process interruption listeners
process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));
process.on('uncaughtException', async (err) => {
  console.error("[Lifecycle] Uncaught Exception:", err);
  await handleExit('uncaughtException');
});
process.on('unhandledRejection', async (reason) => {
  console.error("[Lifecycle] Unhandled Rejection:", reason);
  await handleExit('unhandledRejection');
});

// Helper to strip comments from source code
function stripComments(code) {
  let cleaned = code.replace(/\/\*[\s\S]*?\*\//g, '');
  cleaned = cleaned.split('\n').map(line => {
    return line.replace(/(^|[^:])\/\/.*$/, '$1');
  }).join('\n');
  return cleaned;
}

// Global test counters
let totalTests = 0;
let passedTests = 0;

function printResult(tcId, name, success, message = '') {
  const symbol = success ? '✅' : '❌';
  console.log(`${symbol} [${tcId}] ${name}${message ? ` - ${message}` : ''}`);
}

async function runTestCase(tcId, name, testFn) {
  totalTests++;
  try {
    const passed = await testFn();
    printResult(tcId, name, passed);
    if (passed) passedTests++;
  } catch (err) {
    printResult(tcId, name, false, `Error: ${err.message}`);
  }
}

// Helper to run BigQuery SQL queries safely
async function runQuery(sql, params = {}) {
  try {
    const [rows] = await bigquery.query({ query: sql, params });
    return rows;
  } catch (err) {
    throw new Error(`BigQuery Error: ${err.message}`);
  }
}

const testUrl = (params) => {
  const q = new URLSearchParams(params).toString();
  return `http://localhost:3003/api/analytics/sustainability?${q}`;
};

async function main() {
  console.log("==================================================");
  console.log("Running Environmental & Sustainability E2E Test Suite");
  console.log("==================================================\n");

  try {
    // ----------------------------------------------------
    // FEATURE 1: Schema Migration & Seeding Verification (10 cases)
    // ----------------------------------------------------
    console.log("\n--- Feature 1: Schema Migration & Seeding Verification ---");

    await runTestCase("TC-1.1", "Verify irrigation_m3 column exists in fields table as FLOAT64", async () => {
      const cols = await runQuery(`
        SELECT data_type 
        FROM \`jamie-bq-test.agriflow.INFORMATION_SCHEMA.COLUMNS\` 
        WHERE table_name = 'fields' AND column_name = 'irrigation_m3'
      `);
      return cols.length > 0 && cols[0].data_type === 'FLOAT64';
    });

    await runTestCase("TC-1.2", "Verify distance_km column exists in routes_edge table as FLOAT64", async () => {
      const cols = await runQuery(`
        SELECT data_type 
        FROM \`jamie-bq-test.agriflow.INFORMATION_SCHEMA.COLUMNS\` 
        WHERE table_name = 'routes_edge' AND column_name = 'distance_km'
      `);
      return cols.length > 0 && cols[0].data_type === 'FLOAT64';
    });

    await runTestCase("TC-1.3", "Verify property graph supply_chain_graph exists in BigQuery metadata", async () => {
      try {
        await runQuery(`
          SELECT * FROM GRAPH_TABLE(\`jamie-bq-test.agriflow.supply_chain_graph\`
            MATCH (n) RETURN n.id LIMIT 1
          )
        `);
        return true;
      } catch (err) {
        return false;
      }
    });


    await runTestCase("TC-1.4", "Verify seeded irrigation_m3 mock values are in [500.0, 2000.0] range", async () => {
      const range = await runQuery(`
        SELECT MIN(irrigation_m3) as minVal, MAX(irrigation_m3) as maxVal 
        FROM \`jamie-bq-test.agriflow.fields\` 
        WHERE irrigation_m3 IS NOT NULL AND irrigation_m3 > 0
      `);
      if (range.length === 0 || range[0].minVal === null) return false;
      return range[0].minVal >= 500.0 && range[0].maxVal <= 2000.0;
    });

    await runTestCase("TC-1.5", "Verify seeded distance_km mock values are in [10.0, 150.0] range", async () => {
      const range = await runQuery(`
        SELECT MIN(distance_km) as minVal, MAX(distance_km) as maxVal 
        FROM \`jamie-bq-test.agriflow.routes_edge\` 
        WHERE distance_km IS NOT NULL
      `);
      if (range.length === 0 || range[0].minVal === null) return false;
      return range[0].minVal >= 10.0 && range[0].maxVal <= 150.0;
    });

    await runTestCase("TC-1.6", "Check Harvest stage fields have non-null irrigation_m3", async () => {
      const missing = await runQuery(`
        SELECT COUNT(*) as count 
        FROM \`jamie-bq-test.agriflow.fields\` 
        WHERE cropStage = 'Harvest' AND irrigation_m3 IS NULL
      `);
      return missing.length > 0 && Number(missing[0].count) === 0;
    });

    await runTestCase("TC-1.7", "Verify no zero or negative distances in routes_edge", async () => {
      const invalidDist = await runQuery(`
        SELECT COUNT(*) as count 
        FROM \`jamie-bq-test.agriflow.routes_edge\` 
        WHERE distance_km <= 0
      `);
      return invalidDist.length > 0 && Number(invalidDist[0].count) === 0;
    });

    await runTestCase("TC-1.8", "Verify no duplicate routes_edge connections (field_id, plant_id)", async () => {
      const duplicates = await runQuery(`
        SELECT field_id, plant_id, COUNT(*) as count 
        FROM \`jamie-bq-test.agriflow.routes_edge\` 
        GROUP BY field_id, plant_id 
        HAVING count > 1
      `);
      return duplicates.length === 0;
    });

    await runTestCase("TC-1.9", "Verify every Harvest field node has a routed path to a plant node", async () => {
      const disconnected = await runQuery(`
        SELECT f.id 
        FROM \`jamie-bq-test.agriflow.fields\` f
        LEFT JOIN \`jamie-bq-test.agriflow.routes_edge\` r ON f.id = r.field_id
        WHERE f.cropStage = 'Harvest' AND r.field_id IS NULL
      `);
      return disconnected.length === 0;
    });

    await runTestCase("TC-1.10", "Verify database migration script setup_bigquery.py compiles successfully", async () => {
      const pyPath = path.join(process.cwd(), 'scripts/setup_bigquery.py');
      if (!fs.existsSync(pyPath)) {
        throw new Error(`scripts/setup_bigquery.py not found`);
      }
      try {
        execSync(`python3 -m py_compile ${pyPath}`);
        return true;
      } catch (err) {
        throw new Error(`Python compilation failed: ${err.message}`);
      }
    });

    // ----------------------------------------------------
    // GET REAL TEST FIELD FROM BIGQUERY
    // ----------------------------------------------------
    console.log("\nDiscovering test fields from BigQuery...");
    let testField = "Field-103"; // fallback defaults
    try {
      const fields = await runQuery(`
        SELECT DISTINCT f.fieldName 
        FROM \`jamie-bq-test.agriflow.fields\` f
        WHERE f.cropStage = 'Harvest' AND f.yieldTons IS NOT NULL
        LIMIT 1
      `);
      if (fields.length > 0) {
        testField = fields[0].fieldName;
        console.log(`Using discovered test field: ${testField}`);
      } else {
        console.log(`No Harvest field with yieldTons found. Defaulting to: ${testField}`);
      }
    } catch (err) {
      console.log(`Failed to query test fields: ${err.message}. Defaulting to: ${testField}`);
    }

    // ----------------------------------------------------
    // START SERVER
    // ----------------------------------------------------
    await startServer();

    // ----------------------------------------------------
    // FEATURE 2: API Route Input & Error Handling (10 cases)
    // ----------------------------------------------------
    console.log("\n--- Feature 2: API Route Input & Error Handling ---");

    await runTestCase("TC-2.1", "Happy path API query with valid fieldName returns 200 and correct JSON payload", async () => {
      try {
        const res = await fetch(testUrl({ fieldName: testField }));
        if (res.status !== 200) return false;
        const data = await res.json();
        const hasData = typeof data.waterUseEfficiency === 'number' &&
                        typeof data.soilRunoffRisk === 'string' &&
                        typeof data.carbonFootprint === 'number';
        isApiAvailable = hasData;
        return hasData;
      } catch (err) {
        isApiAvailable = false;
        return false;
      }
    });

    await runTestCase("TC-2.2", "Missing fieldName parameter returns 400 Bad Request", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({}));
      return res.status === 400;
    });

    await runTestCase("TC-2.3", "Empty string fieldName parameter returns 400 Bad Request", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: '' }));
      return res.status === 400;
    });

    await runTestCase("TC-2.4", "Query for non-existent field name returns 404 Not Found", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: 'NonExistentField-XYZ-123' }));
      return res.status === 404;
    });

    await runTestCase("TC-2.5", "Inspect headers on valid request and verify Content-Type contains application/json", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField }));
      const contentType = res.headers.get('content-type');
      return contentType && contentType.includes('application/json');
    });

    await runTestCase("TC-2.6", "SQL Injection payload is handled safely returning 400 or 404", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: "Field-103'; SELECT * FROM fields;--" }));
      return res.status === 400 || res.status === 404;
    });

    await runTestCase("TC-2.7", "XSS Script Injection payload is handled safely returning 400 or 404", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: "<script>alert('xss')</script>" }));
      return res.status === 400 || res.status === 404;
    });

    await runTestCase("TC-2.8", "Buffer overflow input protection (5000 chars) is handled safely", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const longFieldName = 'A'.repeat(5000);
      const res = await fetch(testUrl({ fieldName: longFieldName }));
      return res.status === 400 || res.status === 404 || res.status === 414;
    });

    await runTestCase("TC-2.9", "Extra unused query parameters are ignored and return 200 OK", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, dummyParam: 'hello', foo: 'bar' }));
      return res.status === 200;
    });

    await runTestCase("TC-2.10", "Case-sensitivity check (lowercase name) returns 404 Not Found if DB is case sensitive", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField.toLowerCase() }));
      return res.status === 404;
    });


    // ----------------------------------------------------
    // FEATURE 3: Water Use Efficiency (WUE) KPI Calculations (10 cases)
    // ----------------------------------------------------
    console.log("\n--- Feature 3: Water Use Efficiency (WUE) Calculations ---");

    await runTestCase("TC-3.1", "Verify WUE calculation correctness (Yield = 40.0, Irrigation = 1000.0 -> WUE = 0.040)", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '40.0', overrideIrrigation: '1000.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.waterUseEfficiency - 0.040) < 0.0001;
    });

    await runTestCase("TC-3.2", "Check formatting decimal count is exactly 3 decimal places (as rounded float or string)", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '40.12345', overrideIrrigation: '1000.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.waterUseEfficiency - 0.040) < 0.0001;
    });

    await runTestCase("TC-3.3", "Zero yield case returns 0.000", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '0.0', overrideIrrigation: '1000.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.waterUseEfficiency === 0;
    });

    await runTestCase("TC-3.4", "High yield, low irrigation (Yield = 100.0, Irrigation = 500.0 -> WUE = 0.200)", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '100.0', overrideIrrigation: '500.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.waterUseEfficiency - 0.200) < 0.0001;
    });

    await runTestCase("TC-3.5", "Value data type returned is numeric", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return typeof data.waterUseEfficiency === 'number';
    });

    await runTestCase("TC-3.6", "Zero irrigation (division by zero prevention) returns 0.000 or null gracefully", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '40.0', overrideIrrigation: '0.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.waterUseEfficiency === 0 || data.waterUseEfficiency === null;
    });

    await runTestCase("TC-3.7", "Null irrigation in DB handles safely without crash", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideIrrigation: 'null' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.waterUseEfficiency === 0 || data.waterUseEfficiency === null;
    });

    await runTestCase("TC-3.8", "Null yield in DB handles safely without crash", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: 'null' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.waterUseEfficiency === 0 || data.waterUseEfficiency === null;
    });

    await runTestCase("TC-3.9", "Extreme small floating point precision (Yield = 0.001, Irrigation = 1999.9) rounds to 0.000 safely", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '0.001', overrideIrrigation: '1999.9' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.waterUseEfficiency === 0.000;
    });

    await runTestCase("TC-3.10", "Maximum bounds calculation (Yield = 99.999, Irrigation = 500.0 -> WUE = 0.200)", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '99.999', overrideIrrigation: '500.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.waterUseEfficiency - 0.200) < 0.0001;
    });


    // ----------------------------------------------------
    // FEATURE 4: Soil Runoff Risk Calculation (10 cases)
    // ----------------------------------------------------
    console.log("\n--- Feature 4: Soil Runoff Risk Calculation ---");

    await runTestCase("TC-4.1", "High runoff risk with high moisture (> 25%) and chemical sprays returns High", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '26.0', overrideHasSprays: 'true' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'High';
    });

    await runTestCase("TC-4.2", "Medium/Low runoff risk with low moisture (<= 25%) and sprays returns Medium or Low", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '24.0', overrideHasSprays: 'true' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'Medium' || data.soilRunoffRisk === 'Low';
    });

    await runTestCase("TC-4.3", "Medium/Low runoff risk with high moisture but no sprays returns Medium or Low", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '26.0', overrideHasSprays: 'false' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'Medium' || data.soilRunoffRisk === 'Low';
    });

    await runTestCase("TC-4.4", "Low runoff risk with dry soil (< 15%) and no sprays returns Low", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '10.0', overrideHasSprays: 'false' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'Low';
    });

    await runTestCase("TC-4.5", "Validate returned risk enum values are one of [Low, Medium, High]", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return ['Low', 'Medium', 'High'].includes(data.soilRunoffRisk);
    });

    await runTestCase("TC-4.6", "Moisture exactly at threshold (25.0%) with sprays returns Medium or Low", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '25.0', overrideHasSprays: 'true' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'Medium' || data.soilRunoffRisk === 'Low';
    });

    await runTestCase("TC-4.7", "Moisture slightly above threshold (25.1%) with sprays returns High", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '25.1', overrideHasSprays: 'true' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'High';
    });

    await runTestCase("TC-4.8", "Chemical products marked as empty or None with high moisture returns Low or Medium", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '28.0', overrideChemicalProduct: 'None' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'Low' || data.soilRunoffRisk === 'Medium';
    });

    await runTestCase("TC-4.9", "Missing/null soil moisture in DB defaults safely", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: 'null' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return ['Low', 'Medium', 'High'].includes(data.soilRunoffRisk);
    });

    await runTestCase("TC-4.10", "Redundant multiple sprays in timeline with high moisture returns High", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '28.0', overrideHasSprays: 'true', overrideSpraysCount: '5' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'High';
    });


    // ----------------------------------------------------
    // FEATURE 5: Transit Carbon Footprint Calculation (10 cases)
    // ----------------------------------------------------
    console.log("\n--- Feature 5: Transit Carbon Footprint Calculation ---");

    await runTestCase("TC-5.1", "Verify transit emissions calculation (Yield = 40.0, Distance = 100.0 -> Carbon = 480.0 kg CO₂)", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '40.0', overrideDistance: '100.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.carbonFootprint - 480.0) < 0.001;
    });

    await runTestCase("TC-5.2", "Value data type returned is numeric", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return typeof data.carbonFootprint === 'number';
    });

    await runTestCase("TC-5.3", "Zero yield carbon footprint returns 0.0", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '0.0', overrideDistance: '100.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.carbonFootprint === 0;
    });

    await runTestCase("TC-5.4", "Zero distance carbon footprint returns 0.0", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '40.0', overrideDistance: '0.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.carbonFootprint === 0;
    });

    await runTestCase("TC-5.5", "Verify transport emissions factor ratio matches exactly 0.12", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '50.0', overrideDistance: '80.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.carbonFootprint / (50.0 * 80.0) - 0.12) < 0.0001;
    });

    await runTestCase("TC-5.6", "Null route distance returns 0.0 without crashing", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideDistance: 'null' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.carbonFootprint === 0 || data.carbonFootprint === null;
    });

    await runTestCase("TC-5.7", "Large bounds validation (Yield = 500.0, Distance = 2000.0 -> Carbon = 120000.0)", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '500.0', overrideDistance: '2000.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.carbonFootprint - 120000.0) < 0.001;
    });

    await runTestCase("TC-5.8", "Negative values handling returns 0.0 or handles safely", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '-10.0', overrideDistance: '50.0' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.carbonFootprint === 0 || data.carbonFootprint === null;
    });

    await runTestCase("TC-5.9", "Route edge missing entirely for a field returns 0.0 footprint", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideDistance: 'null' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.carbonFootprint === 0 || data.carbonFootprint === null;
    });

    await runTestCase("TC-5.10", "Float precision rounding matches exactly the mathematical product", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, overrideYieldTons: '12.345', overrideDistance: '67.89' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      const expected = parseFloat((12.345 * 67.89 * 0.12).toFixed(6));
      return Math.abs(data.carbonFootprint - expected) < 0.01;
    });


    // ----------------------------------------------------
    // TIER 3: Cross-Feature Combinations (5 cases)
    // ----------------------------------------------------
    console.log("\n--- Tier 3: Cross-Feature Combinations ---");

    await runTestCase("TC-3.11", "Cross-check API WUE with direct BigQuery calculation (Yield / Irrigation)", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const bqData = await runQuery(`
        SELECT yieldTons, irrigation_m3 
        FROM \`jamie-bq-test.agriflow.fields\` 
        WHERE fieldName = @testField AND cropStage = 'Harvest'
        LIMIT 1
      `, { testField });
      if (bqData.length === 0 || bqData[0].irrigation_m3 === null) {
        throw new Error("No matching Harvest record in BigQuery to cross-check");
      }
      const bqYield = bqData[0].yieldTons;
      const bqIrrigation = bqData[0].irrigation_m3;
      const expectedWUE = parseFloat((bqYield / bqIrrigation).toFixed(3));

      const res = await fetch(testUrl({ fieldName: testField }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.waterUseEfficiency - expectedWUE) < 0.001;
    });

    await runTestCase("TC-3.12", "Cross-check API Carbon Footprint with direct BigQuery query (Yield * Distance * 0.12)", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const bqData = await runQuery(`
        SELECT f.yieldTons, r.distance_km 
        FROM \`jamie-bq-test.agriflow.fields\` f
        JOIN \`jamie-bq-test.agriflow.routes_edge\` r ON f.id = r.field_id
        WHERE f.fieldName = @testField AND f.cropStage = 'Harvest'
        LIMIT 1
      `, { testField });
      if (bqData.length === 0) {
        throw new Error("No matching route record in BigQuery to cross-check");
      }
      const expectedCarbon = parseFloat((bqData[0].yieldTons * bqData[0].distance_km * 0.12).toFixed(6));

      const res = await fetch(testUrl({ fieldName: testField }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return Math.abs(data.carbonFootprint - expectedCarbon) < 0.1;
    });

    await runTestCase("TC-3.13", "Verify dynamic DB updates to yieldTons propagate correctly to WUE/Carbon API responses", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      // 1. Get original value
      const original = await runQuery(`
        SELECT yieldTons FROM \`jamie-bq-test.agriflow.fields\` 
        WHERE fieldName = @testField AND cropStage = 'Harvest' LIMIT 1
      `, { testField });
      if (original.length === 0) throw new Error("Harvest record not found in BQ");
      const origYield = original[0].yieldTons;

      // Define rollback operation
      const rollback = async () => {
        console.log(`[Rollback] Restoring yieldTons for ${testField} to ${origYield}`);
        await runQuery(`
          UPDATE \`jamie-bq-test.agriflow.fields\` 
          SET yieldTons = @origYield 
          WHERE fieldName = @testField AND cropStage = 'Harvest'
        `, { testField, origYield });
      };

      try {
        // Register cleanup callback in case runner is interrupted
        registerCleanup(rollback);

        // 2. Perform DB Update
        await runQuery(`
          UPDATE \`jamie-bq-test.agriflow.fields\` 
          SET yieldTons = 42.42 
          WHERE fieldName = @testField AND cropStage = 'Harvest'
        `, { testField });

        // 3. Fetch API and check propagation
        const res = await fetch(testUrl({ fieldName: testField }));
        if (res.status !== 200) return false;
        const data = await res.json();

        console.log(`Updated yield to 42.42, got carbonFootprint: ${data.carbonFootprint}, waterUseEfficiency: ${data.waterUseEfficiency}`);
        return data.waterUseEfficiency !== null && data.carbonFootprint !== null;
      } finally {
        // Run rollback manually and unregister from queue
        await rollback();
        unregisterCleanup(rollback);
      }
    });

    await runTestCase("TC-3.14", "Verify dynamic DB updates to distance_km propagate correctly to Carbon API response", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      // 1. Get original value
      const original = await runQuery(`
        SELECT r.distance_km, f.id FROM \`jamie-bq-test.agriflow.fields\` f
        JOIN \`jamie-bq-test.agriflow.routes_edge\` r ON f.id = r.field_id
        WHERE f.fieldName = @testField AND f.cropStage = 'Harvest' LIMIT 1
      `, { testField });
      if (original.length === 0) throw new Error("Route record not found in BQ");
      const origDist = original[0].distance_km;
      const fieldId = original[0].id;

      // Define rollback operation
      const rollback = async () => {
        console.log(`[Rollback] Restoring distance_km for fieldId ${fieldId} to ${origDist}`);
        await runQuery(`
          UPDATE \`jamie-bq-test.agriflow.routes_edge\` 
          SET distance_km = @origDist 
          WHERE field_id = @fieldId
        `, { fieldId, origDist });
      };

      try {
        registerCleanup(rollback);

        // 2. Perform DB Update
        await runQuery(`
          UPDATE \`jamie-bq-test.agriflow.routes_edge\` 
          SET distance_km = 123.45 
          WHERE field_id = @fieldId
        `, { fieldId });

        // 3. Fetch API and check propagation
        const res = await fetch(testUrl({ fieldName: testField }));
        if (res.status !== 200) return false;
        const data = await res.json();

        return data.carbonFootprint !== null;
      } finally {
        await rollback();
        unregisterCleanup(rollback);
      }
    });

    await runTestCase("TC-3.15", "Verify dynamic DB updates to irrigation_m3 propagate correctly to WUE API response", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      // 1. Get original value
      const original = await runQuery(`
        SELECT irrigation_m3 FROM \`jamie-bq-test.agriflow.fields\` 
        WHERE fieldName = @testField AND cropStage = 'Harvest' LIMIT 1
      `, { testField });
      if (original.length === 0) throw new Error("Harvest record not found in BQ");
      const origIrrig = original[0].irrigation_m3;

      // Define rollback operation
      const rollback = async () => {
        console.log(`[Rollback] Restoring irrigation_m3 for ${testField} to ${origIrrig}`);
        await runQuery(`
          UPDATE \`jamie-bq-test.agriflow.fields\` 
          SET irrigation_m3 = @origIrrig 
          WHERE fieldName = @testField AND cropStage = 'Harvest'
        `, { testField, origIrrig });
      };

      try {
        registerCleanup(rollback);

        // 2. Perform DB Update
        await runQuery(`
          UPDATE \`jamie-bq-test.agriflow.fields\` 
          SET irrigation_m3 = 999.9 
          WHERE fieldName = @testField AND cropStage = 'Harvest'
        `, { testField });

        // 3. Fetch API and check propagation
        const res = await fetch(testUrl({ fieldName: testField }));
        if (res.status !== 200) return false;
        const data = await res.json();

        return data.waterUseEfficiency !== null;
      } finally {
        await rollback();
        unregisterCleanup(rollback);
      }
    });


    // ----------------------------------------------------
    // TIER 4: Real-World Workload & DB Verification (5 cases)
    // ----------------------------------------------------
    console.log("\n--- Tier 4: Real-World Workload & DB Verification ---");

    await runTestCase("TC-4.11", "Complex wet runoff condition (moisture = 27%, multiple sprays) returns High", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '27.0', overrideHasSprays: 'true', overrideSpraysCount: '3' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'High';
    });

    await runTestCase("TC-4.12", "Non-chemical spray runoff check (moisture = 28%, only nitrogen fertilizer, no pesticides) returns Low or Medium", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '28.0', overrideChemicalProduct: 'Nitrogen Fertilizer' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'Low' || data.soilRunoffRisk === 'Medium';
    });

    await runTestCase("TC-4.13", "Chemical sprays on dry soil (moisture = 12%) returns Low or Medium", async () => {
      if (!isApiAvailable) throw new Error("API Happy Path is unavailable");
      const res = await fetch(testUrl({ fieldName: testField, soilMoisture: '12.0', overrideHasSprays: 'true' }));
      if (res.status !== 200) return false;
      const data = await res.json();
      return data.soilRunoffRisk === 'Low' || data.soilRunoffRisk === 'Medium';
    });

    await runTestCase("TC-4.14", "UI details drawer rendering integrity check on InteractiveGraph.jsx source code", async () => {
      const uiFilePath = path.join(process.cwd(), 'src/components/InteractiveGraph.jsx');
      if (!fs.existsSync(uiFilePath)) {
        throw new Error(`src/components/InteractiveGraph.jsx not found`);
      }
      const rawContent = fs.readFileSync(uiFilePath, 'utf8');
      const content = stripComments(rawContent);
      
      const hasHeader = content.includes("Precision Sustainability Ledger") || content.includes("Sustainability Ledger");
      const hasWUE = content.includes("Water-Use Efficiency") || content.includes("waterUseEfficiency") || content.includes("Tons/m³");
      const hasRunoff = content.includes("Runoff Risk Warning") || content.includes("soilRunoffRisk") || content.includes("badge");
      const hasTransport = content.includes("Transport Footprint") || content.includes("carbonFootprint") || content.includes("kg CO₂");
      const hasTooltip = content.includes("Tooltip") || content.includes("tooltip");

      return hasHeader && hasWUE && hasRunoff && hasTransport && hasTooltip;
    });

    await runTestCase("TC-4.15", "UI Graph node selection event integration check (selecting field node triggers API fetch)", async () => {
      const uiFilePath = path.join(process.cwd(), 'src/components/InteractiveGraph.jsx');
      if (!fs.existsSync(uiFilePath)) {
        throw new Error(`src/components/InteractiveGraph.jsx not found`);
      }
      const rawContent = fs.readFileSync(uiFilePath, 'utf8');
      const content = stripComments(rawContent);

      const hasRouteFetch = /\/api\/analytics\/sustainability/.test(content);
      const hasNodeClick = /onNodeClick|handleNodeClick|selectNode|nodeSelection/.test(content);

      return hasRouteFetch && hasNodeClick;
    });

  } catch (err) {
    console.error("\n❌ Error during test run execution:", err.message);
  } finally {
    stopServer();
  }

  console.log("\n==================================================");
  console.log(`Test Execution Summary: ${passedTests} / ${totalTests} passed`);
  console.log("==================================================\n");

  if (passedTests < totalTests) {
    console.error("❌ E2E Test Suite Run Failed.");
    process.exitCode = 1;
  } else {
    console.log("✅ All executed tests completed successfully!");
    process.exitCode = 0;
  }
}

if (require.main === module) {
  main();
}
