'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Award, Truck, Sprout, User, AlertTriangle, CheckCircle, Flame, Droplet, TrendingUp, RefreshCw } from 'lucide-react';

export default function InteractiveGraph({ selectedRegion, fields = [] }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);

  // Drilldown states
  const [drilldownDim, setDrilldownDim] = useState('region'); // 'region', 'agronomist', 'variety'
  const [selectedDimVal, setSelectedDimVal] = useState('All');

  // Simulation alpha cooling ref
  const alphaRef = useRef(1.0);
  const containerRef = useRef(null);
  const requestRef = useRef(null);

  const width = 640;
  const height = 400;

  // 1. Compile Graph Vertices and Edges based on BigQuery records
  useEffect(() => {
    if (!fields || fields.length === 0) return;
    setIsLoading(true);

    let activeRecords = [...fields];
    if (selectedDimVal !== 'All') {
      if (drilldownDim === 'region') {
        activeRecords = fields.filter(f => f.region === selectedDimVal);
      } else if (drilldownDim === 'agronomist') {
        activeRecords = fields.filter(f => f.agronomistName === selectedDimVal);
      } else if (drilldownDim === 'variety') {
        activeRecords = fields.filter(f => f.variety === selectedDimVal);
      }
    }

    const nodesMap = new Map();
    const links = [];

    const plantNames = {
      'NA': 'Frito-Lay Plant (Chicago)',
      'LATAM': 'Frito-Lay Plant (São Paulo)',
      'AMESA': 'Frito-Lay Plant (Cairo)'
    };

    activeRecords.forEach(r => {
      const region = r.region || 'NA';
      const plantId = `plant-${region}`;
      const growerId = `grower-${r.growerName.replace(/\s+/g, '-')}`;
      const fieldId = `field-${r.fieldName.replace(/\s+/g, '-')}`;
      const agroId = `agro-${r.agronomistName?.replace(/\s+/g, '-') || 'unknown'}`;
      
      // A. Plant Node (Glow Gold)
      if (!nodesMap.has(plantId)) {
        nodesMap.set(plantId, {
          id: plantId,
          label: plantNames[region] || 'Frito-Lay Plant',
          type: 'plant',
          region: region,
          size: 20,
          color: '#ffd000' // Frito Yellow
        });
      }

      // B. Agronomist Node (Orange)
      if (r.agronomistName && !nodesMap.has(agroId)) {
        nodesMap.set(agroId, {
          id: agroId,
          label: r.agronomistName,
          type: 'agronomist',
          region: region,
          size: 16,
          color: '#f97316' // Amber
        });
      }

      // C. Grower Node (Crimson / Flagged Red)
      if (!nodesMap.has(growerId)) {
        const yieldVal = parseFloat(r.yieldTons) || 0;
        const moisture = parseFloat(r.soilMoisture) || 0;
        const isAnomaly = yieldVal < 26.0 || moisture > 32.0;

        nodesMap.set(growerId, {
          id: growerId,
          label: r.growerName,
          type: 'grower',
          vendor: r.growerName,
          region: region,
          status: isAnomaly ? 'flagged' : 'compliant',
          size: 18,
          color: isAnomaly ? '#ba1a1a' : '#b90027' // Brand Crimson
        });
      }

      // D. Field Node (Neon Green)
      if (!nodesMap.has(fieldId)) {
        nodesMap.set(fieldId, {
          id: fieldId,
          label: r.fieldName,
          type: 'field',
          variety: r.variety,
          yieldTons: parseFloat(r.yieldTons) || 0,
          ndvi: parseFloat(r.ndvi) || 0.6,
          soilMoisture: parseFloat(r.soilMoisture) || 0,
          region: region,
          size: 14,
          color: '#10b981' // Emerald
        });
      }

      // Connections (Links)
      if (r.agronomistName) {
        const auditLink = { source: agroId, target: growerId, label: 'AUDITS' };
        if (!links.some(l => l.source === auditLink.source && l.target === auditLink.target)) links.push(auditLink);
      }

      const operatesLink = { source: growerId, target: fieldId, label: 'OPERATES' };
      if (!links.some(l => l.source === operatesLink.source && l.target === operatesLink.target)) links.push(operatesLink);

      const routedLink = { source: fieldId, target: plantId, label: 'ROUTED' };
      if (!links.some(l => l.source === routedLink.source && l.target === routedLink.target)) links.push(routedLink);
    });

    const nodes = Array.from(nodesMap.values()).map((n, idx) => {
      const angle = (idx / nodesMap.size) * 2 * Math.PI;
      const radius = 95 + Math.random() * 25;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0
      };
    });

    const resolvedLinks = links.map(l => ({
      ...l,
      sourceRef: nodes.find(n => n.id === l.source),
      targetRef: nodes.find(n => n.id === l.target)
    })).filter(l => l.sourceRef && l.targetRef);

    setGraphData({ nodes, links: resolvedLinks });
    setIsLoading(false);

    // Reset alpha cooling simulation to fully active
    alphaRef.current = 1.0;
  }, [fields, selectedRegion, drilldownDim, selectedDimVal]);

  // 2. Derive Display Subset (Hides unrelated nodes when a node is clicked)
  const getDisplayData = () => {
    if (!selectedNode) {
      return graphData;
    }

    const nodeId = selectedNode.id;
    const connectedLinks = graphData.links.filter(l => 
      l.sourceRef.id === nodeId || l.targetRef.id === nodeId
    );

    const connectedNodeIds = new Set();
    connectedNodeIds.add(nodeId);
    connectedLinks.forEach(l => {
      connectedNodeIds.add(l.sourceRef.id);
      connectedNodeIds.add(l.targetRef.id);
    });

    const displayNodes = graphData.nodes.filter(n => connectedNodeIds.has(n.id));
    const displayLinks = graphData.links.filter(l => 
      connectedNodeIds.has(l.sourceRef.id) && connectedNodeIds.has(l.targetRef.id)
    );

    return { nodes: displayNodes, links: displayLinks };
  };

  const { nodes: displayNodes, links: displayLinks } = getDisplayData();

  // 3. Physics Simulation with Alpha Decay Cooling Loop
  useEffect(() => {
    if (graphData.nodes.length === 0) return;

    const tick = () => {
      if (alphaRef.current < 0.02) {
        cancelAnimationFrame(requestRef.current);
        return;
      }

      alphaRef.current *= 0.94;

      setGraphData(prev => {
        const nodes = prev.nodes.map(n => ({ ...n, fx: 0, fy: 0 }));
        const links = prev.links;

        const kRepulsion = 6000;
        const kAttraction = 0.04;
        const restLength = 70;
        const centerGravity = 0.02;

        // Repulsion forces
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const distSq = dx * dx + dy * dy || 1;
            const dist = Math.sqrt(distSq);

            if (dist < 200) {
              const force = (kRepulsion / distSq) * alphaRef.current;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              n1.fx -= fx;
              n1.fy -= fy;
              n2.fx += fx;
              n2.fy += fy;
            }
          }
        }

        // Attraction forces
        links.forEach(l => {
          const s = nodes.find(n => n.id === l.sourceRef.id);
          const t = nodes.find(n => n.id === l.targetRef.id);
          if (!s || !t) return;

          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = kAttraction * (dist - restLength) * alphaRef.current;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          s.fx += fx;
          s.fy += fy;
          t.fx -= fx;
          t.fy -= fy;
        });

        // Update positions
        const updatedNodes = nodes.map(n => {
          if (draggedNode && n.id === draggedNode.id) return n;

          // Pull toward center
          n.fx += (width / 2 - n.x) * centerGravity * alphaRef.current;
          n.fy += (height / 2 - n.y) * centerGravity * alphaRef.current;

          // SPECIAL CENTERING FORCES: Reorganize graph around selected node
          if (selectedNode) {
            const selId = selectedNode.id;
            if (n.id === selId) {
              n.fx += (width / 2 - n.x) * 0.15 * alphaRef.current;
              n.fy += (height / 2 - n.y) * 0.15 * alphaRef.current;
            } else {
              const isNeighbor = links.some(l => 
                (l.sourceRef.id === selId && l.targetRef.id === n.id) ||
                (l.targetRef.id === selId && l.sourceRef.id === n.id)
              );
              if (isNeighbor) {
                const dx = n.x - (width / 2);
                const dy = n.y - (height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const targetDist = 95;
                const force = 0.05 * (dist - targetDist) * alphaRef.current;
                n.fx -= (dx / dist) * force;
                n.fy -= (dy / dist) * force;
              }
            }
          }

          const damping = 0.70;
          n.vx = (n.vx + n.fx) * damping;
          n.vy = (n.vy + n.fy) * damping;

          let nextX = n.x + n.vx;
          let nextY = n.y + n.vy;

          const pad = 24;
          nextX = Math.max(pad, Math.min(width - pad, nextX));
          nextY = Math.max(pad, Math.min(height - pad, nextY));

          return { ...n, x: nextX, y: nextY };
        });

        const updatedLinks = links.map(l => ({
          ...l,
          sourceRef: updatedNodes.find(n => n.id === l.sourceRef.id),
          targetRef: updatedNodes.find(n => n.id === l.targetRef.id)
        }));

        return { nodes: updatedNodes, links: updatedLinks };
      });

      requestRef.current = requestAnimationFrame(tick);
    };

    requestRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestRef.current);
  }, [graphData.nodes.length, draggedNode?.id, selectedNode?.id]);

  // Mouse drag triggers
  const handleMouseDown = (e, node) => {
    e.preventDefault();
    setDraggedNode(node);
    alphaRef.current = 1.0;
  };

  const handleMouseMove = (e) => {
    if (!draggedNode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * width;
    const localY = ((e.clientY - rect.top) / rect.height) * height;

    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => 
        n.id === draggedNode.id 
          ? { ...n, x: localX, y: localY, vx: 0, vy: 0 } 
          : n
      )
    }));
    alphaRef.current = 1.0;
  };

  const handleMouseUp = () => {
    setDraggedNode(null);
  };

  const selectNodeAction = (node) => {
    setSelectedNode(node);
    alphaRef.current = 1.0;
  };

  // Compile drilldown filter options
  const getDimensionValues = () => {
    if (!fields) return ['All'];
    const vals = new Set();
    fields.forEach(f => {
      if (drilldownDim === 'region') vals.add(f.region);
      else if (drilldownDim === 'agronomist') vals.add(f.agronomistName);
      else if (drilldownDim === 'variety') vals.add(f.variety);
    });
    return ['All', ...Array.from(vals).filter(Boolean)];
  };

  // Aggregate telemetry statistics
  const getAggregatedStats = () => {
    let filtered = [...fields];
    if (selectedDimVal !== 'All') {
      if (drilldownDim === 'region') filtered = fields.filter(f => f.region === selectedDimVal);
      else if (drilldownDim === 'agronomist') filtered = fields.filter(f => f.agronomistName === selectedDimVal);
      else if (drilldownDim === 'variety') filtered = fields.filter(f => f.variety === selectedDimVal);
    }

    const totalYield = filtered.reduce((sum, f) => sum + (parseFloat(f.yieldTons) || 0), 0);
    const avgMoisture = filtered.reduce((sum, f) => sum + (parseFloat(f.soilMoisture) || 0), 0) / (filtered.length || 1);
    
    const anomalies = filtered.filter(f => {
      const y = parseFloat(f.yieldTons) || 0;
      const sm = parseFloat(f.soilMoisture) || 0;
      return y < 26.0 || sm > 32.0;
    }).length;

    const totalDefect = filtered.reduce((sum, f) => sum + (parseFloat(f.defectRate) || 0), 0);
    const avgDefect = totalDefect / (filtered.length || 1);
    const qualityScore = Math.max(70, Math.min(100, Math.round(100 - (avgDefect * 6.5))));

    return {
      totalYield: Math.round(totalYield),
      avgMoisture: avgMoisture.toFixed(1),
      anomalies,
      qualityScore,
      count: filtered.length
    };
  };

  const stats = getAggregatedStats();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '1.25rem', width: '100%', fontFamily: 'Inter, sans-serif' }}>
      
      {/* LEFT: Bravoverse-Style Dark Futuristic Neon Property Graph */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div 
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            position: 'relative',
            width: '100%',
            height: '400px',
            background: 'radial-gradient(circle at center, rgba(10, 25, 47, 0.6) 0%, rgba(7, 10, 16, 1) 100%)', // Peacock Bravoverse gradient
            border: '1.5px solid rgba(0, 180, 216, 0.12)', // Cyan overlay border
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: 'inset 0 4px 25px rgba(0,0,0,0.7)',
            cursor: draggedNode ? 'grabbing' : 'grab'
          }}
        >
          <style>{`
            @keyframes pulse-ring {
              0% { transform: scale(0.96); opacity: 0.8; }
              50% { transform: scale(1.15); opacity: 0.3; }
              100% { transform: scale(0.96); opacity: 0.8; }
            }
            .graph-node {
              cursor: pointer;
              transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
            }
            .graph-node:hover {
              filter: drop-shadow(0 0 10px var(--glow-color));
            }
            line {
              transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
            }
          `}</style>

          {isLoading && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(7, 10, 16, 0.85)',
              zIndex: 10
            }}>
              <Loader2 className="animate-spin" size={24} color="#00b4d8" />
            </div>
          )}

          {/* Reset Focused Graph button */}
          {selectedNode && (
            <button
              onClick={() => selectNodeAction(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                backgroundColor: 'rgba(0, 180, 216, 0.1)',
                border: '1.5px solid rgba(0, 180, 216, 0.25)',
                color: '#00b4d8',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.62rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                zIndex: 15,
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              <RefreshCw size={10} /> Reset Focus
            </button>
          )}

          <svg 
            viewBox={`0 0 ${width} ${height}`} 
            style={{ width: '100%', height: '100%', userSelect: 'none' }}
          >
            <defs>
              <filter id="neon-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* A. Render link lines (Highlight direct connections, fade others out to 4% opacity) */}
            {displayLinks.map((link, idx) => {
              const isDirectLink = selectedNode && (selectedNode.id === link.sourceRef.id || selectedNode.id === link.targetRef.id);
              
              let opacity = 0.40; // Default link opacity
              if (selectedNode) {
                opacity = isDirectLink ? 0.90 : 0.04;
              }

              return (
                <line
                  key={`link-${idx}`}
                  x1={link.sourceRef.x}
                  y1={link.sourceRef.y}
                  x2={link.targetRef.x}
                  y2={link.targetRef.y}
                  stroke={isDirectLink ? '#00b4d8' : link.label === 'AUDITS' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(255, 255, 255, 0.12)'}
                  strokeWidth={isDirectLink ? 2.2 : 1.2}
                  strokeDasharray={isDirectLink ? '4,3' : 'none'}
                  opacity={opacity}
                />
              );
            })}

            {/* B. Render link label tags on edge lines */}
            {displayLinks.map((link, idx) => {
              const isDirectLink = selectedNode && (selectedNode.id === link.sourceRef.id || selectedNode.id === link.targetRef.id);
              
              let opacity = 0.35;
              if (selectedNode) {
                opacity = isDirectLink ? 0.85 : 0.02;
              }

              const midX = (link.sourceRef.x + link.targetRef.x) / 2;
              const midY = (link.sourceRef.y + link.targetRef.y) / 2;
              
              return (
                <g key={`link-label-${idx}`} opacity={opacity}>
                  <rect
                    x={midX - 16}
                    y={midY - 7}
                    width="32"
                    height="14"
                    rx="4"
                    fill="#060913"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="1"
                  />
                  <text
                    x={midX}
                    y={midY + 3}
                    textAnchor="middle"
                    fontSize="7px"
                    fontWeight="bold"
                    fill="rgba(255, 255, 255, 0.5)"
                  >
                    {link.label}
                  </text>
                </g>
              );
            })}

            {/* C. Render Node Vertices (Bravoverse style: Pitch black fill, colored stroke glow, Lucide vector icons) */}
            {displayNodes.map(node => {
              const isSelected = selectedNode && selectedNode.id === node.id;
              
              // Fade out unselected nodes when a focus node is active (Bravoverse 15% opacity rule)
              let opacity = 1.0;
              if (selectedNode && !isSelected) {
                // If it's a neighbor, keep it visible, otherwise dim it down to 15%
                const isNeighbor = displayLinks.some(l => 
                  (l.sourceRef.id === selectedNode.id && l.targetRef.id === node.id) ||
                  (l.targetRef.id === selectedNode.id && l.sourceRef.id === node.id)
                );
                opacity = isNeighbor ? 1.0 : 0.15;
              }

              return (
                <g 
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => selectNodeAction(node)}
                  onMouseDown={(e) => handleMouseDown(e, node)}
                  className="graph-node"
                  opacity={opacity}
                  style={{
                    '--glow-color': node.color,
                    transition: 'opacity 0.4s ease'
                  }}
                >
                  {/* Bravoverse active selector pulsing ring */}
                  {isSelected && (
                    <circle
                      cx="0"
                      cy="0"
                      r={node.size + 4}
                      fill="none"
                      stroke={node.color}
                      strokeWidth="1.5"
                      strokeDasharray="4,2"
                      style={{
                        transformOrigin: '0px 0px',
                        animation: 'pulse-ring 2s infinite ease-in-out'
                      }}
                    />
                  )}
                  
                  {/* Pitch-black inner circle with glowing neon borders */}
                  <circle
                    cx="0"
                    cy="0"
                    r={node.size}
                    fill="#060913" // Pitch black inner fill
                    stroke={isSelected ? '#ffffff' : node.color} // White border on selected
                    strokeWidth={isSelected ? 2.2 : 1.2}
                    style={{
                      filter: `drop-shadow(0 0 ${isSelected ? '9px' : '3px'} ${node.color})`,
                      transition: 'all 0.4s ease'
                    }}
                  />

                  {/* SVG ForeignObject to render sleek vector Lucide icons inside circle nodes */}
                  <foreignObject
                    x={-8}
                    y={-8}
                    width={16}
                    height={16}
                    style={{ pointerEvents: 'none' }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      color: isSelected ? '#ffffff' : node.color
                    }}>
                      {node.type === 'plant' && <Truck size={10} />}
                      {node.type === 'agronomist' && <User size={10} />}
                      {node.type === 'grower' && <Sprout size={10} />}
                      {node.type === 'field' && <TrendingUp size={10} />}
                    </div>
                  </foreignObject>

                  {/* Node Label Text */}
                  <text
                    y={node.size + 12}
                    textAnchor="middle"
                    fontSize="8px"
                    fontWeight={isSelected ? '800' : '600'}
                    fill={isSelected ? '#ffe792' : '#cbd5e1'}
                    style={{ 
                      pointerEvents: 'none', 
                      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.9))',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating Hover Details Tooltip */}
          {hoveredNode && (
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              backgroundColor: 'rgba(7, 10, 16, 0.92)',
              border: '1.5px solid rgba(0, 180, 216, 0.25)',
              borderRadius: '8px',
              padding: '8px 12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 20,
              fontSize: '0.72rem',
              color: '#ffffff',
              pointerEvents: 'none',
              backdropFilter: 'blur(8px)',
              maxWidth: '220px'
            }}>
              <strong style={{ fontSize: '0.78rem', display: 'block', marginBottom: '4px', textTransform: 'uppercase', color: hoveredNode.color }}>
                {hoveredNode.type}: {hoveredNode.label}
              </strong>
              {hoveredNode.type === 'grower' && (
                <>
                  <strong>Region:</strong> {hoveredNode.region}<br/>
                  <strong>Compliance:</strong> <span style={{ color: hoveredNode.status === 'flagged' ? '#ba1a1a' : '#10b981', fontWeight: 'bold' }}>{hoveredNode.status.toUpperCase()}</span>
                </>
              )}
              {hoveredNode.type === 'field' && (
                <>
                  <strong>Variety:</strong> {hoveredNode.variety}<br/>
                  <strong>Yield:</strong> {hoveredNode.yieldTons} Tons<br/>
                  <strong>NDVI:</strong> {hoveredNode.ndvi}<br/>
                  <strong>Moisture:</strong> {hoveredNode.soilMoisture}%
                </>
              )}
              {hoveredNode.type === 'agronomist' && (
                <>
                  <strong>Region:</strong> {hoveredNode.region}<br/>
                  <strong>Task:</strong> Supplier Audit Ingestion
                </>
              )}
            </div>
          )}
        </div>

        {/* Brand Node Color Legend */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0.4rem 0.8rem',
          padding: '0.4rem',
          background: 'rgba(10, 25, 47, 0.3)',
          borderRadius: '8px',
          border: '1.5px solid rgba(0, 180, 216, 0.08)'
        }}>
          {[
            { label: 'Ingestion Plants', color: '#ffd000' },
            { label: 'Agronomists', color: '#f97316' },
            { label: 'Suppliers/Growers', color: '#b90027' },
            { label: 'Grower Plots', color: '#10b981' }
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.color, border: '1px solid rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: '0.52rem', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.04em' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Executive Risk & Drilldown Analytical Control Panel */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        backgroundColor: 'var(--bg-card)',
        border: '1.5px solid var(--border-card)',
        backdropFilter: 'blur(16px)',
        borderRadius: '16px',
        padding: '1.25rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        height: '400px',
        overflowY: 'auto'
      }}>
        
        {selectedNode ? (
          /* Node Summary drilldown details view */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '#0.58rem', fontWeight: 'bold', textTransform: 'uppercase', color: selectedNode.color, letterSpacing: '0.5px' }}>
                {selectedNode.type} Details Focused
              </span>
              <button 
                onClick={() => selectNodeAction(null)}
                style={{
                  border: 'none',
                  backgroundColor: 'transparent',
                  fontSize: '0.65rem',
                  color: 'var(--frito-red-dark)',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }}
              >
                Clear Focus
              </button>
            </div>
            
            <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 2px 0' }}>
              {selectedNode.label}
            </h3>
            
            <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.72rem' }}>
              {selectedNode.type === 'field' && (
                <>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Potato Variety</span>
                    <strong>{selectedNode.variety}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Final Yield Ingested</span>
                    <strong style={{ color: '#10b981', fontSize: '0.85rem' }}>{selectedNode.yieldTons} Tons</strong>
                  </div>
                  <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-card)', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }}>Earth Engine Analytics</span>
                    <strong>Sentinel-2 NDVI:</strong> {selectedNode.ndvi}<br/>
                    <strong>SMAP Soil Moisture:</strong> {selectedNode.soilMoisture}%
                  </div>
                </>
              )}
              {selectedNode.type === 'grower' && (
                <>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Supplier Entity</span>
                    <strong>{selectedNode.vendor || selectedNode.label}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Region Division</span>
                    <strong>{selectedNode.region} Operations</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Auditor Verification Status</span>
                    <strong style={{ color: selectedNode.status === 'flagged' ? '#ff897a' : '#10b981', fontSize: '0.85rem' }}>
                      {selectedNode.status === 'flagged' ? '⚠️ AUDIT INGESTION FAILURE' : '✓ VALID SUPPLIER'}
                    </strong>
                  </div>
                </>
              )}
              {selectedNode.type === 'agronomist' && (
                <>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Regional Lead</span>
                    <strong>{selectedNode.label}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Audit Jurisdiction</span>
                    <strong>{selectedNode.region} Supply Lines</strong>
                  </div>
                </>
              )}
              {selectedNode.type === 'plant' && (
                <>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Processing Facility</span>
                    <strong>{selectedNode.label}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.62rem' }}>Destination Territory</span>
                    <strong>{selectedNode.region} Logistics Hub</strong>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Segment Drilldown Risk view */
          <>
            <h4 style={{ fontSize: '0.82rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)', margin: 0, letterSpacing: '0.5px' }}>
              Executive Risk Control
            </h4>

            {/* 1. Dimension Selector Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase' }}>Drilldown Segment</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', backgroundColor: 'var(--bg-secondary)', padding: '2px', borderRadius: '8px' }}>
                {['region', 'agronomist', 'variety'].map(dim => (
                  <button
                    key={dim}
                    onClick={() => { setDrilldownDim(dim); setSelectedDimVal('All'); }}
                    style={{
                      backgroundColor: drilldownDim === dim ? 'var(--frito-red)' : 'transparent',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 2px',
                      fontSize: '0.58rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {dim}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Specific Value Dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase' }}>Selected Filter</span>
              <select
                value={selectedDimVal}
                onChange={(e) => setSelectedDimVal(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--border-card)',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  outline: 'none',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                {getDimensionValues().map(val => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </div>

            {/* 3. Aggregated Segment Risks Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
              
              {/* Quality Health Score */}
              <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={16} color="#10b981" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Ingestion Quality</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.qualityScore}% Health</span>
                  </div>
                </div>
              </div>

              {/* Active Flagged Anomalies */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyBetween: 'space-between', 
                backgroundColor: stats.anomalies > 0 ? 'rgba(186, 26, 26, 0.12)' : 'rgba(255, 255, 255, 0.02)', 
                padding: '10px', 
                borderRadius: '10px', 
                border: stats.anomalies > 0 ? '1px solid rgba(186, 26, 26, 0.25)' : '1px solid var(--border-card)' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ 
                    width: '28px', 
                    height: '28px', 
                    borderRadius: '50%', 
                    backgroundColor: stats.anomalies > 0 ? 'rgba(186,26,26,0.1)' : 'rgba(255,255,255,0.04)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <AlertTriangle size={16} color={stats.anomalies > 0 ? '#ff897a' : 'var(--text-secondary)'} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Flagged Anomalies</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: stats.anomalies > 0 ? '#ff897a' : 'var(--text-primary)' }}>
                      {stats.anomalies} Issues Detected
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Yield & Fields Count */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--border-card)', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Volume</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <TrendingUp size={12} color="#10b981" /> {stats.totalYield} T
                  </span>
                </div>
                <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--border-card)', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Active Plots</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {stats.count} fields
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

      </div>

    </div>
  );
}
