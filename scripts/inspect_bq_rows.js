const db = require('../src/services/db');

async function testRows() {
  console.log("Fetching rows from BigQuery...");
  const records = await db.getRecords();
  console.log(`Fetched ${records.length} records.`);
  
  if (records.length > 0) {
    const firstRow = records[0];
    console.log("\nFirst Row Keys:", Object.keys(firstRow));
    console.log("\nfieldLocation Value:", firstRow.fieldLocation || firstRow.fieldlocation || "MISSING");
    
    // Check if fieldLocation is under a different case
    if (!firstRow.fieldLocation && firstRow.fieldlocation) {
      console.log("\n>>> CASE MISMATCH TRIGGERED: column is all-lowercase 'fieldlocation' <<<");
    }
  } else {
    console.log("No records found in table.");
  }
}

testRows();
