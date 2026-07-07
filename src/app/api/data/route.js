const { NextResponse } = require('next/server');
const { getRecords } = require('../../../services/db');

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const records = await getRecords();
    return NextResponse.json({ records });
  } catch (error) {
    console.error('API Error in /api/data:', error);
    return NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 });
  }
}
