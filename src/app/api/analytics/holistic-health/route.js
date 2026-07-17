import { NextResponse } from 'next/server';
const { BigQuery } = require('@google-cloud/bigquery');
const { getHolisticHealth } = require('../../../../services/vertex');

const bigquery = new BigQuery({ projectId: 'jamie-bq-test' });

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fieldName = searchParams.get('fieldName');
    const ndviStr = searchParams.get('ndvi');
    const soilMoistureStr = searchParams.get('soilMoisture');

    if (!fieldName || !ndviStr || !soilMoistureStr) {
      return NextResponse.json(
        { error: 'Missing required query parameters: fieldName, ndvi, and soilMoisture are all required.' },
        { status: 400 }
      );
    }

    const ndvi = parseFloat(ndviStr);
    const soilMoisture = parseFloat(soilMoistureStr);

    if (isNaN(ndvi) || isNaN(soilMoisture)) {
      return NextResponse.json(
        { error: 'Invalid ndvi or soilMoisture parameters: must be valid numeric values.' },
        { status: 400 }
      );
    }

    if (ndvi < -1.0 || ndvi > 1.0) {
      return NextResponse.json(
        { error: 'Invalid ndvi parameter: must be between -1.0 and 1.0.' },
        { status: 400 }
      );
    }

    if (soilMoisture < 0.0 || soilMoisture > 100.0) {
      return NextResponse.json(
        { error: 'Invalid soilMoisture parameter: must be between 0.0 and 100.0.' },
        { status: 400 }
      );
    }

    // 1. Fetch chronological crop stage timeline from BigQuery Property Graph
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

    const [timelineEvents] = await bigquery.query({
      query: timelineQuery,
      params: { fieldName }
    });

    if (!timelineEvents || timelineEvents.length === 0) {
      return NextResponse.json(
        { error: `Field not found: ${fieldName}` },
        { status: 404 }
      );
    }

    // 2. Call the advisor helper from vertex.js to compute the grade and advisory
    const result = await getHolisticHealth(fieldName, ndvi, soilMoisture, timelineEvents);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Holistic Health API Error:', error);
    return NextResponse.json(
      { error: 'Server error', details: error.message },
      { status: 500 }
    );
  }
}
