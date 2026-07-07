const { NextResponse } = require('next/server');
const { getRecords } = require('../../../services/db');
const { queryAnalyticsData } = require('../../../services/vertex');

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const query = body.query;
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter is missing' }, { status: 400 });
    }
    
    const records = await getRecords();
    
    // Call Gemini to query the data
    const answer = await queryAnalyticsData(query, records);
    
    return NextResponse.json({ answer });
  } catch (error) {
    console.error('API Error in /api/query:', error);
    return NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 });
  }
}
