import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({ projectId: 'jamie-bq-test' });

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fieldName = searchParams.get('fieldName');
    
    if (!fieldName) {
      return NextResponse.json({ error: 'Missing fieldName parameter' }, { status: 400 });
    }

    // Query BigQuery Graph using openCypher to extract all stage submissions for this field
    const timelineQuery = `
      SELECT * FROM GRAPH_TABLE(
        agriflow.supply_chain_graph
        MATCH (g:Grower)-[oe:OPERATES]->(f:Field)
        WHERE f.fieldName = @fieldName
        RETURN 
          f.id AS logId,
          f.cropStage AS stage,
          f.variety AS variety,
          f.submissionTimestamp AS timestamp,
          f.moisturePercentage AS moisture,
          f.defectRate AS defectRate,
          f.yieldTons AS yield,
          f.fertilizerType AS fertilizer,
          f.chemicalProduct AS pesticide,
          f.chemicalType AS chemicalType,
          f.seedTreatments AS seedTreatments,
          f.submissionStatus AS status
      )
      ORDER BY timestamp ASC
    `;

    const [rows] = await bigquery.query({
      query: timelineQuery,
      params: { fieldName }
    });

    return NextResponse.json({ timeline: rows });
  } catch (error) {
    console.error('Timeline API Error:', error);
    return NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 });
  }
}
