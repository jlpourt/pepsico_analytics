import { NextResponse } from 'next/server';
const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery({ projectId: 'jamie-bq-test' });

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fieldName = searchParams.get('fieldName');

    if (!fieldName) {
      return NextResponse.json(
        { error: 'Missing required parameter: fieldName is required.' },
        { status: 400 }
      );
    }

    // Overrides
    const overrideYieldTons = searchParams.get('overrideYieldTons');
    const overrideIrrigation = searchParams.get('overrideIrrigation');
    const overrideDistance = searchParams.get('overrideDistance');
    const overrideHasSprays = searchParams.get('overrideHasSprays');
    const overrideChemicalProduct = searchParams.get('overrideChemicalProduct');
    const soilMoisture = searchParams.get('soilMoisture');

    // Query BigQuery for field timeline stages
    const query = `
      SELECT cropStage, yieldTons, irrigation_m3, distance_km, moisturePercentage, chemicalProduct
      FROM \`jamie-bq-test.agriflow.grower_submissions\`
      WHERE fieldName = @fieldName
    `;

    const [rows] = await bigquery.query({
      query,
      params: { fieldName }
    });

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: `Field not found: ${fieldName}` },
        { status: 404 }
      );
    }

    const harvestRow = rows.find(r => r.cropStage === 'Harvest');
    const seedingRow = rows.find(r => r.cropStage === 'Seeding');
    const appRow = rows.find(r => r.cropStage === 'Application');

    // 1. Resolve yield
    let yieldTons = null;
    if (overrideYieldTons === 'null') {
      yieldTons = null;
    } else if (overrideYieldTons !== null && overrideYieldTons !== undefined) {
      yieldTons = parseFloat(overrideYieldTons);
    } else if (harvestRow) {
      yieldTons = harvestRow.yieldTons;
    }

    // 2. Resolve irrigation
    let irrigation_m3 = null;
    if (overrideIrrigation === 'null') {
      irrigation_m3 = null;
    } else if (overrideIrrigation !== null && overrideIrrigation !== undefined) {
      irrigation_m3 = parseFloat(overrideIrrigation);
    } else if (seedingRow) {
      irrigation_m3 = seedingRow.irrigation_m3;
    }

    // 3. Resolve distance
    let distance_km = null;
    if (overrideDistance === 'null') {
      distance_km = null;
    } else if (overrideDistance !== null && overrideDistance !== undefined) {
      distance_km = parseFloat(overrideDistance);
    } else if (harvestRow && harvestRow.distance_km !== null) {
      distance_km = harvestRow.distance_km;
    } else if (seedingRow && seedingRow.distance_km !== null) {
      distance_km = seedingRow.distance_km;
    } else if (appRow && appRow.distance_km !== null) {
      distance_km = appRow.distance_km;
    }

    // 4. Resolve moisture
    let moisture = null;
    if (soilMoisture === 'null') {
      moisture = null;
    } else if (soilMoisture !== null && soilMoisture !== undefined) {
      moisture = parseFloat(soilMoisture);
    } else if (harvestRow && harvestRow.moisturePercentage !== null) {
      moisture = harvestRow.moisturePercentage;
    } else {
      moisture = 20.0; // default fallback
    }

    // 5. Resolve chemical product & sprays
    let chemicalProduct = null;
    if (overrideChemicalProduct === 'null') {
      chemicalProduct = null;
    } else if (overrideChemicalProduct !== null && overrideChemicalProduct !== undefined) {
      chemicalProduct = overrideChemicalProduct;
    } else if (appRow) {
      chemicalProduct = appRow.chemicalProduct;
    }

    const nonChemicals = ['None', 'Nitrogen Fertilizer', 'Compost', 'Urea', 'NPK 15-15-15'];
    let hasSprays = false;
    if (overrideHasSprays === 'null') {
      hasSprays = false;
    } else if (overrideHasSprays !== null && overrideHasSprays !== undefined) {
      hasSprays = overrideHasSprays === 'true';
    } else if (chemicalProduct) {
      hasSprays = !nonChemicals.includes(chemicalProduct);
    }

    // --- Calculations ---

    // A. Water Use Efficiency
    let waterUseEfficiency = 0.000;
    if (irrigation_m3 !== null && irrigation_m3 > 0 && yieldTons !== null && yieldTons >= 0) {
      waterUseEfficiency = parseFloat((yieldTons / irrigation_m3).toFixed(3));
    } else if (irrigation_m3 === null || yieldTons === null) {
      waterUseEfficiency = null;
    }

    // B. Soil Runoff Risk
    let soilRunoffRisk = 'Low';
    if (hasSprays && moisture > 25.0) {
      soilRunoffRisk = 'High';
    } else if (hasSprays && moisture <= 25.0) {
      soilRunoffRisk = 'Medium';
    } else if (!hasSprays && moisture > 25.0) {
      soilRunoffRisk = 'Medium';
    } else {
      soilRunoffRisk = 'Low';
    }

    // C. Transit Carbon Footprint
    let carbonFootprint = 0.0;
    if (yieldTons !== null && distance_km !== null) {
      if (yieldTons > 0 && distance_km > 0) {
        carbonFootprint = parseFloat((yieldTons * distance_km * 0.12).toFixed(6));
      } else if (yieldTons < 0 || distance_km < 0) {
        carbonFootprint = null;
      }
    } else {
      carbonFootprint = null;
    }

    return NextResponse.json({
      waterUseEfficiency,
      soilRunoffRisk,
      carbonFootprint
    });

  } catch (error) {
    console.error('Sustainability API Error:', error);
    return NextResponse.json(
      { error: 'Server error', details: error.message },
      { status: 500 }
    );
  }
}
