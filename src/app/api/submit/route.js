const { NextResponse } = require('next/server');
const { saveRecord } = require('../../../services/db');

export async function POST(request) {
  try {
    const body = await request.json();
    const record = body.record;
    
    if (!record) {
      return NextResponse.json({ error: 'Record data is missing' }, { status: 400 });
    }
    
    // Add validation states: Green / Amber / Red status based on rules
    // Rule checks
    let status = 'Approved';
    const moisture = parseFloat(record.moisturePercentage);
    const defect = parseFloat(record.defectRate);
    
    if (isNaN(moisture) || moisture > 20 || defect > 10) {
      status = 'Flagged'; // High moisture or defect rates trigger warnings
    } else if (!record.fieldName || !record.variety || !record.growerName) {
      status = 'Pending'; // Missing critical master data
    }
    
    record.submissionStatus = status;
    
    const success = await saveRecord(record);
    if (!success) {
      return NextResponse.json({ error: 'Failed to write record to file system' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, record });
  } catch (error) {
    console.error('API Error in /api/submit:', error);
    return NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 });
  }
}
