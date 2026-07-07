const { BigQuery } = require('@google-cloud/bigquery');

// Initialize BigQuery client
const bigquery = new BigQuery({
  projectId: 'jamie-bq-test'
});

/**
 * Format a BigQuery timestamp field safely.
 */
function formatTimestamp(tsField) {
  if (!tsField) return new Date().toISOString();
  if (typeof tsField === 'object' && tsField.value) {
    return new Date(tsField.value).toISOString();
  }
  return new Date(tsField).toISOString();
}

/**
 * Fetch crop submissions from BigQuery.
 */
async function getRecords() {
  const sqlQuery = `
    SELECT * 
    FROM \`jamie-bq-test.agriflow.grower_submissions\` 
    ORDER BY submissionTimestamp DESC 
    LIMIT 100
  `;
  
  try {
    const [rows] = await bigquery.query({ query: sqlQuery });
    return rows.map(r => {
      // Deterministic calculation of simulated Earth Engine stats based on ID
      const seed = parseInt(r.id.replace(/\D/g, '')) || 42;
      const ndvi = (0.55 + (seed % 30) / 100).toFixed(2);
      const soilMoisture = (15.5 + (seed % 20)).toFixed(1);
      const surfaceTemp = (20.5 + (seed % 10)).toFixed(1);
      const slope = (0.5 + (seed % 5) * 0.8).toFixed(1);

      return {
        ...r,
        // Map BQ columns to properties expected by frontend
        timestamp: formatTimestamp(r.submissionTimestamp),
        ndvi,
        soilMoisture,
        surfaceTemp,
        slope,
        // Ensure numeric fields are returned as numbers or clean string representations
        moisturePercentage: r.moisturePercentage !== null ? String(r.moisturePercentage) : '',
        defectRate: r.defectRate !== null ? String(r.defectRate) : '',
        yieldTons: r.yieldTons !== null ? String(r.yieldTons) : '',
        activeIngredientRate: r.activeIngredientRate !== null ? String(r.activeIngredientRate) : '',
        nApplied: r.nApplied !== null ? String(r.nApplied) : '',
        nTotal: r.nTotal !== null ? String(r.nTotal) : '',
        pTotal: r.pTotal !== null ? String(r.pTotal) : '',
        kTotal: r.kTotal !== null ? String(r.kTotal) : '',
        nitrogenAnalysis: r.nitrogenAnalysis !== null ? String(r.nitrogenAnalysis) : '',
        ammoniaPercentage: r.ammoniaPercentage !== null ? String(r.ammoniaPercentage) : '',
        nitricPercentage: r.nitricPercentage !== null ? String(r.nitricPercentage) : '',
        ureaPercentage: r.ureaPercentage !== null ? String(r.ureaPercentage) : '',
        phosphateAnalysis: r.phosphateAnalysis !== null ? String(r.phosphateAnalysis) : '',
        potassiumAnalysis: r.potassiumAnalysis !== null ? String(r.potassiumAnalysis) : '',
        applicationRate: r.applicationRate !== null ? String(r.applicationRate) : '',
        cropType: r.cropType || 'Potatoes',
        equipmentModel: r.equipmentModel || '',
        totalFuelGal: r.totalFuelGal !== null ? String(r.totalFuelGal) : '',
        fuelRateGalAc: r.fuelRateGalAc !== null ? String(r.fuelRateGalAc) : '',
        productivityAcHr: r.productivityAcHr !== null ? String(r.productivityAcHr) : '',
        areaSeededAc: r.areaSeededAc !== null ? String(r.areaSeededAc) : '',
        appliedRateSeedsAc: r.appliedRateSeedsAc !== null ? String(r.appliedRateSeedsAc) : '',
        targetRateSeedsAc: r.targetRateSeedsAc !== null ? String(r.targetRateSeedsAc) : '',
        cropStage: r.cropStage || 'Harvest'
      };
    });
  } catch (error) {
    console.error("Error fetching BigQuery records:", error);
    return [];
  }
}

/**
 * Save/Insert a crop submission record into BigQuery.
 */
async function saveRecord(record) {
  try {
    const id = record.id || `REC-${Math.floor(1000 + Math.random() * 9000)}`;
    const submissionStatus = record.submissionStatus || 'Approved';
    
    const insertQuery = `
      INSERT INTO \`jamie-bq-test.agriflow.grower_submissions\` (
        id, fieldName, variety, country, vendorName, growerName, cropSeason, fieldLocation, region, vendorContact,
        cipcApplied, activeIngredientRate, irrigationType, nApplied, nTotal, pTotal, kTotal, vrtUsed,
        fertilizerType, fertilizerNature, nitrogenAnalysis, ammoniaPercentage, nitricPercentage, ureaPercentage,
        phosphateAnalysis, potassiumAnalysis, applicationRate, applicationMethod, emissionsInhibitors, applicationDate,
        agronomistName, moisturePercentage, defectRate, yieldTons, submissionStatus, submissionTimestamp,
        cropType, equipmentModel, totalFuelGal, fuelRateGalAc, productivityAcHr, areaSeededAc, appliedRateSeedsAc, targetRateSeedsAc,
        cropStage
      ) VALUES (
        @id, @fieldName, @variety, @country, @vendorName, @growerName, @cropSeason, @fieldLocation, @region, @vendorContact,
        @cipcApplied, @activeIngredientRate, @irrigationType, @nApplied, @nTotal, @pTotal, @kTotal, @vrtUsed,
        @fertilizerType, @fertilizerNature, @nitrogenAnalysis, @ammoniaPercentage, @nitricPercentage, @ureaPercentage,
        @phosphateAnalysis, @potassiumAnalysis, @applicationRate, @applicationMethod, @emissionsInhibitors, @applicationDate,
        @agronomistName, @moisturePercentage, @defectRate, @yieldTons, @submissionStatus, CURRENT_TIMESTAMP(),
        @cropType, @equipmentModel, @totalFuelGal, @fuelRateGalAc, @productivityAcHr, @areaSeededAc, @appliedRateSeedsAc, @targetRateSeedsAc,
        @cropStage
      )
    `;
    
    const safeFloat = (val) => {
      if (val === undefined || val === null || val === '') return null;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? null : parsed;
    };
    
    // Parameter definitions mapping (protects against SQL Injection)
    const params = {
      id: id,
      fieldName: record.fieldName || null,
      variety: record.variety || null,
      country: record.country || null,
      vendorName: record.vendorName || null,
      growerName: record.growerName || null,
      cropSeason: record.cropSeason || null,
      fieldLocation: record.fieldLocation || null,
      region: record.region || null,
      vendorContact: record.vendorContact || null,
      cipcApplied: record.cipcApplied || null,
      activeIngredientRate: safeFloat(record.activeIngredientRate),
      irrigationType: record.irrigationType || null,
      nApplied: safeFloat(record.nApplied),
      nTotal: safeFloat(record.nTotal),
      pTotal: safeFloat(record.pTotal),
      kTotal: safeFloat(record.kTotal),
      vrtUsed: record.vrtUsed || null,
      fertilizerType: record.fertilizerType || null,
      fertilizerNature: record.fertilizerNature || null,
      nitrogenAnalysis: safeFloat(record.nitrogenAnalysis),
      ammoniaPercentage: safeFloat(record.ammoniaPercentage),
      nitricPercentage: safeFloat(record.nitricPercentage),
      ureaPercentage: safeFloat(record.ureaPercentage),
      phosphateAnalysis: safeFloat(record.phosphateAnalysis),
      potassiumAnalysis: safeFloat(record.potassiumAnalysis),
      applicationRate: safeFloat(record.applicationRate),
      applicationMethod: record.applicationMethod || null,
      emissionsInhibitors: record.emissionsInhibitors || null,
      applicationDate: record.applicationDate || null,
      agronomistName: record.agronomistName || null,
      moisturePercentage: safeFloat(record.moisturePercentage),
      defectRate: safeFloat(record.defectRate),
      yieldTons: safeFloat(record.yieldTons),
      submissionStatus: submissionStatus,
      cropType: record.cropType || 'Potatoes',
      equipmentModel: record.equipmentModel || null,
      totalFuelGal: safeFloat(record.totalFuelGal),
      fuelRateGalAc: safeFloat(record.fuelRateGalAc),
      productivityAcHr: safeFloat(record.productivityAcHr),
      areaSeededAc: safeFloat(record.areaSeededAc),
      appliedRateSeedsAc: record.appliedRateSeedsAc ? parseInt(record.appliedRateSeedsAc) : null,
      targetRateSeedsAc: record.targetRateSeedsAc ? parseInt(record.targetRateSeedsAc) : null,
      cropStage: record.cropStage || 'Harvest'
    };
    
    await bigquery.query({
      query: insertQuery,
      params: params
    });
    
    console.log(`Saved record ${id} to BigQuery.`);
    return true;
  } catch (error) {
    console.error("Error inserting record into BigQuery:", error);
    return false;
  }
}

module.exports = {
  getRecords,
  saveRecord
};
