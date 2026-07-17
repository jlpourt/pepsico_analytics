import { NextResponse } from 'next/server';
const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery({ projectId: 'jamie-bq-test' });

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');
    const fieldId = searchParams.get('fieldId');

    const cleanNodeId = nodeId ? nodeId.trim() : null;
    const cleanFieldId = fieldId ? fieldId.trim() : null;

    const targetId = cleanNodeId || cleanFieldId;

    if (!targetId) {
      return NextResponse.json({ error: 'Missing nodeId or fieldId parameter' }, { status: 400 });
    }

    const invalidPrefixes = ['agro-', 'grower-', 'plant-', 'field-'];
    if (invalidPrefixes.includes(targetId)) {
      return NextResponse.json({ error: 'Invalid ID parameter: empty prefix' }, { status: 400 });
    }

    // Handle UI-formatted field IDs
    let isUiField = false;
    let fieldName = '';
    if (targetId.startsWith('field-')) {
      isUiField = true;
      const rawFieldName = targetId.substring(6); // strip 'field-'
      const spacedFieldName = rawFieldName.replace(/-/g, ' ');

      // Query BQ to see which version exists
      const checkQuery = `
        SELECT DISTINCT fieldName
        FROM GRAPH_TABLE(
          agriflow.supply_chain_graph
          MATCH (f:Field)
          RETURN f.fieldName AS fieldName
        )
        WHERE fieldName = @rawFieldName OR fieldName = @spacedFieldName
        LIMIT 1
      `;
      const [checkRows] = await bigquery.query({
        query: checkQuery,
        params: { rawFieldName, spacedFieldName }
      });

      if (checkRows.length > 0) {
        fieldName = checkRows[0].fieldName;
      } else {
        fieldName = spacedFieldName;
      }
    }

    // Correctly classify starting node based on ID prefix
    let nodeType = 'field';
    if (targetId.startsWith('agro-')) {
      nodeType = 'agronomist';
    } else if (targetId.startsWith('grower-')) {
      nodeType = 'grower';
    } else if (targetId.startsWith('plant-')) {
      nodeType = 'plant';
    }

    // Dynamic WHERE clause based on starting node type
    let whereClause = '';
    if (nodeType === 'agronomist') {
      whereClause = 'WHERE a.id = @targetId';
    } else if (nodeType === 'grower') {
      whereClause = 'WHERE g.id = @targetId';
    } else if (nodeType === 'field') {
      if (isUiField) {
        whereClause = 'WHERE f.fieldName = @fieldName';
      } else {
        whereClause = 'WHERE f.id = @targetId';
      }
    } else if (nodeType === 'plant') {
      whereClause = 'WHERE p.id = @targetId';
    }

    // Trace downstream connections using GRAPH_TABLE and openCypher
    const lineageQuery = `
      SELECT * FROM GRAPH_TABLE(
        agriflow.supply_chain_graph
        MATCH (a:Agronomist)-[:AUDITS]->(g:Grower)-[:OPERATES]->(f:Field)-[:ROUTED]->(p:Plant)
        ${whereClause}
        RETURN 
          a.id AS agronomistId, a.agronomistName AS agronomistName,
          g.id AS growerId, g.growerName AS growerName,
          f.id AS fieldId, f.fieldName AS fieldName,
          p.id AS plantId, p.plantName AS plantName
      )
    `;

    const queryParams = { targetId };
    if (isUiField) {
      queryParams.fieldName = fieldName;
    }

    const [rows] = await bigquery.query({
      query: lineageQuery,
      params: queryParams
    });

    const nodesMap = new Map();
    const links = [];

    rows.forEach(r => {
      const plantId = r.plantId;
      const growerId = r.growerId;
      const fieldId = r.fieldId;
      const agroId = r.agronomistId;

      if (plantId && !nodesMap.has(plantId)) {
        nodesMap.set(plantId, {
          id: plantId,
          label: r.plantName || plantId,
          type: 'plant'
        });
      }
      if (agroId && !nodesMap.has(agroId)) {
        nodesMap.set(agroId, {
          id: agroId,
          label: r.agronomistName || agroId,
          type: 'agronomist'
        });
      }
      if (growerId && !nodesMap.has(growerId)) {
        nodesMap.set(growerId, {
          id: growerId,
          label: r.growerName || growerId,
          type: 'grower'
        });
      }
      if (fieldId && !nodesMap.has(fieldId)) {
        nodesMap.set(fieldId, {
          id: fieldId,
          label: r.fieldName || fieldId,
          type: 'field'
        });
      }

      // Add unique links representing matched edges
      if (agroId && growerId) {
        const link = { source: agroId, target: growerId };
        if (!links.some(l => l.source === link.source && l.target === link.target)) {
          links.push(link);
        }
      }
      if (growerId && fieldId) {
        const link = { source: growerId, target: fieldId };
        if (!links.some(l => l.source === link.source && l.target === link.target)) {
          links.push(link);
        }
      }
      if (fieldId && plantId) {
        const link = { source: fieldId, target: plantId };
        if (!links.some(l => l.source === link.source && l.target === link.target)) {
          links.push(link);
        }
      }
    });

    const nodes = Array.from(nodesMap.values());

    // Retrieve neighboring grower warnings
    const growerIds = nodes
      .filter(n => n.type === 'grower')
      .map(n => n.id);

    let warnings = [];
    if (growerIds.length > 0) {
      const warningsQuery = `
        SELECT DISTINCT
          growerId, growerName, fieldId, fieldName, status
        FROM GRAPH_TABLE(
          agriflow.supply_chain_graph
          MATCH (g1:Grower)-[:OPERATES]->(f1:Field)-[:ROUTED]->(p:Plant)<-[:ROUTED]-(f2:Field)<-[:OPERATES]-(g2:Grower)
          WHERE g1.id IN UNNEST(@growerIds) AND g2.id != g1.id AND (f2.submissionStatus = 'Flagged' OR f2.submissionStatus = 'Pending')
          RETURN g2.id AS growerId, g2.growerName AS growerName, f2.id AS fieldId, f2.fieldName AS fieldName, f2.submissionStatus AS status
        )
      `;
      const [warningRows] = await bigquery.query({
        query: warningsQuery,
        params: { growerIds }
      });
      warnings = warningRows.map(w => ({
        growerId: w.growerId,
        growerName: w.growerName,
        fieldId: w.fieldId,
        fieldName: w.fieldName,
        status: w.status
      }));
    }

    return NextResponse.json({
      nodes,
      links,
      warnings,
      alerts: warnings
    });

  } catch (error) {
    console.error('Lineage API Error:', error);
    return NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 });
  }
}
