import { NextResponse } from 'next/server';
import { getRecords } from '../../../services/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const regionFilter = searchParams.get('region') || 'All';
    const rawRecords = await getRecords();

    // Filter records by region if needed
    const records = rawRecords.filter(r => regionFilter === 'All' || r.region === regionFilter);

    const nodesMap = new Map();
    const links = [];

    // Define standard regional processing plants
    const plantNames = {
      'NA': 'Frito-Lay Plant (Chicago, USA)',
      'LATAM': 'Frito-Lay Plant (São Paulo, BRA)',
      'AMESA': 'Frito-Lay Plant (Cairo, EGY)'
    };

    records.forEach(r => {
      const region = r.region || 'NA';
      const plantId = `plant-${region}`;
      const growerId = `grower-${r.growerName.replace(/\s+/g, '-')}`;
      const fieldId = `field-${r.fieldName.replace(/\s+/g, '-')}`;
      const agroId = `agro-${r.agronomistName.replace(/\s+/g, '-')}`;
      
      // 1. Add Plant Node
      if (!nodesMap.has(plantId)) {
        nodesMap.set(plantId, {
          id: plantId,
          label: plantNames[region] || 'Frito-Lay Plant',
          type: 'plant',
          region: region,
          size: 30,
          color: '#ffd100' // Frito-Lay Yellow Accent
        });
      }

      // 2. Add Agronomist Node
      if (!nodesMap.has(agroId)) {
        nodesMap.set(agroId, {
          id: agroId,
          label: r.agronomistName,
          type: 'agronomist',
          region: region,
          size: 20,
          color: '#f97316' // Orange
        });
      }

      // 3. Add Grower Node
      if (!nodesMap.has(growerId)) {
        // Calculate status from defect / moisture warnings
        const defect = parseFloat(r.defectRate) || 0;
        const moisture = parseFloat(r.moisturePercentage) || 0;
        const isAnomaly = defect > 6.0 || moisture > 20.0 || moisture < 10.0;
        
        nodesMap.set(growerId, {
          id: growerId,
          label: r.growerName,
          type: 'grower',
          vendor: r.vendorName,
          region: region,
          status: isAnomaly ? 'flagged' : 'compliant',
          size: 22,
          color: isAnomaly ? '#ba1a1a' : '#b90027' // Red (flagged) vs Crimson
        });
      }

      // 4. Add Field Node
      if (!nodesMap.has(fieldId)) {
        nodesMap.set(fieldId, {
          id: fieldId,
          label: r.fieldName,
          type: 'field',
          variety: r.variety,
          yieldTons: parseFloat(r.yieldTons) || 0,
          ndvi: parseFloat(r.ndvi) || 0,
          soilMoisture: parseFloat(r.soilMoisture) || 0,
          region: region,
          size: 16,
          color: '#16a34a' // Green
        });
      }

      // 5. Add Input Node (Treatment)
      const fertilizerKey = `fert-${r.fertilizerType.replace(/\s+/g, '-')}`;
      if (!nodesMap.has(fertilizerKey)) {
        nodesMap.set(fertilizerKey, {
          id: fertilizerKey,
          label: r.fertilizerType,
          type: 'treatment',
          nature: r.fertilizerNature,
          size: 14,
          color: '#8b4513' // Earthy Brown
        });
      }

      // 6. Connect Relationships (Links)
      // Agronomist --[AUDITS]--> Grower
      const auditLink = { source: agroId, target: growerId, label: 'AUDITS' };
      if (!links.some(l => l.source === auditLink.source && l.target === auditLink.target)) {
        links.push(auditLink);
      }

      // Grower --[OPERATES]--> Field
      const operatesLink = { source: growerId, target: fieldId, label: 'OPERATES' };
      if (!links.some(l => l.source === operatesLink.source && l.target === operatesLink.target)) {
        links.push(operatesLink);
      }

      // Field --[TREATED_WITH]--> Treatment
      const treatmentLink = { source: fieldId, target: fertilizerKey, label: 'TREATED' };
      if (!links.some(l => l.source === treatmentLink.source && l.target === treatmentLink.target)) {
        links.push(treatmentLink);
      }

      // Field --[ROUTED_TO]--> Plant
      const routedLink = { 
        source: fieldId, 
        target: plantId, 
        label: 'ROUTED', 
        yieldTons: r.yieldTons,
        defectRate: r.defectRate
      };
      if (!links.some(l => l.source === routedLink.source && l.target === routedLink.target)) {
        links.push(routedLink);
      }
    });

    const nodes = Array.from(nodesMap.values());
    return NextResponse.json({ nodes, links });
  } catch (error) {
    console.error('Graph API Error:', error);
    return NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 });
  }
}
