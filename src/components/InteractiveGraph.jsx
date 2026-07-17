'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Award, Truck, Sprout, User, AlertTriangle, CheckCircle, Flame, Droplet, TrendingUp, RefreshCw, Sparkles } from 'lucide-react';

export default function InteractiveGraph({ selectedRegion, fields = [] }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  
  // Crop Timeline states
  const [timelineData, setTimelineData] = useState([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);

  // Holistic Health Scorecard states
  const [holisticHealth, setHolisticHealth] = useState(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(null);

  // Sustainability Ledger states
  const [sustainabilityData, setSustainabilityData] = useState(null);
  const [isSustainabilityLoading, setIsSustainabilityLoading] = useState(false);

  // Lineage Trace states
  const [lineageData, setLineageData] = useState(null);
  const [lineageWarnings, setLineageWarnings] = useState([]);
  const [isLineageLoading, setIsLineageLoading] = useState(false);

  // Drilldown states
  const [drilldownDim, setDrilldownDim] = useState('region'); // 'region', 'agronomist', 'variety'
  const [selectedDimVal, setSelectedDimVal] = useState('All');

  // Fetch holistic health score
  const fetchHolisticHealth = (fieldName, ndvi, soilMoisture) => {
    setIsHealthLoading(true);
    setHealthError(null);
    fetch(`/api/analytics/holistic-health?fieldName=${encodeURIComponent(fieldName)}&ndvi=${ndvi}&soilMoisture=${soilMoisture}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch holistic health');
        }
        return res.json();
      })
      .then(data => {
        setHolisticHealth(data);
        setIsHealthLoading(false);
      })
      .catch(err => {
        console.error(err);
        setHealthError(err.message || 'Error loading scorecard');
        setIsHealthLoading(false);
      });
  };

  // Fetch sustainability metrics
  const fetchSustainability = (fieldName) => {
    setIsSustainabilityLoading(true);
    fetch(`/api/analytics/sustainability?fieldName=${encodeURIComponent(fieldName)}`)
      .then(res => res.json())
      .then(data => {
        setSustainabilityData(data);
        setIsSustainabilityLoading(false);
      })
      .catch(err => {
        console.error(err);
        setSustainabilityData(null);
        setIsSustainabilityLoading(false);
      });
  };

  // Fetch timeline data and holistic health scorecard when field node is focused
  useEffect(() => {
    Promise.resolve().then(() => {
      if (selectedNode && selectedNode.type === 'field') {
        setIsTimelineLoading(true);
        fetch(`/api/analytics/timeline?fieldName=${selectedNode.label}`)
          .then(res => res.json())
          .then(data => {
            setTimelineData(data.timeline || []);
            setIsTimelineLoading(false);
          })
          .catch(err => {
            console.error(err);
            setTimelineData([]);
            setIsTimelineLoading(false);
          });

        fetchHolisticHealth(selectedNode.label, selectedNode.ndvi, selectedNode.soilMoisture);
        fetchSustainability(selectedNode.label);
      } else {
        setTimelineData([]);
        setHolisticHealth(null);
        setSustainabilityData(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id]);

  // Simulation alpha cooling ref
  const alphaRef = useRef(1.0);
  const containerRef = useRef(null);
  const requestRef = useRef(null);

  const width = 640;
  const height = 400;

  // 1. Compile Graph Vertices and Edges based on BigQuery records
  useEffect(() => {
    if (!fields || fields.length === 0) return;
    Promise.resolve().then(() => {
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
        const growerRecords = activeRecords.filter(rec => rec.growerName === r.growerName);
        const hasFlagged = growerRecords.some(rec => rec.submissionStatus === 'Flagged');
        const hasPending = growerRecords.some(rec => rec.submissionStatus === 'Pending');
        
        let growerColor = '#b90027'; // Brand Crimson (Default Approved)
        let growerStatus = 'Approved';
        if (hasFlagged) {
          growerColor = '#ef4444'; // Neon Red
          growerStatus = 'Flagged';
        } else if (hasPending) {
          growerColor = '#f59e0b'; // Amber
          growerStatus = 'Pending';
        }

        nodesMap.set(growerId, {
          id: growerId,
          label: r.growerName,
          type: 'grower',
          vendor: r.growerName,
          region: region,
          status: growerStatus,
          size: 18,
          color: growerColor
        });
      }

      // D. Field Node (Dynamic Compliance Lights)
      if (!nodesMap.has(fieldId)) {
        const fieldRecords = activeRecords.filter(rec => rec.fieldName === r.fieldName);
        const hasFlagged = fieldRecords.some(rec => rec.submissionStatus === 'Flagged');
        const hasPending = fieldRecords.some(rec => rec.submissionStatus === 'Pending');
        
        let nodeColor = '#10b981'; // Green (Approved)
        let complianceStatus = 'Approved';
        if (hasFlagged) {
          nodeColor = '#ef4444'; // Red
          complianceStatus = 'Flagged';
        } else if (hasPending) {
          nodeColor = '#f59e0b'; // Amber
          complianceStatus = 'Pending';
        }

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
          color: nodeColor,
          status: complianceStatus
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
    });
  }, [fields, selectedRegion, drilldownDim, selectedDimVal]);

  // 2. Derive Display Subset (Hides unrelated nodes when a node is clicked)
  const getDisplayData = () => {
    if (lineageData) {
      return graphData;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setLineageData(null);
    setLineageWarnings([]);
    alphaRef.current = 1.0;
  };

  const handleTraceLineage = (node) => {
    if (!node) return;
    setIsLineageLoading(true);
    fetch(`/api/analytics/lineage?nodeId=${node.id}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch lineage data');
        }
        return res.json();
      })
      .then(data => {
        const nodeIds = new Set(data.nodes.map(n => n.id));
        const linkKeys = new Set(data.links.map(l => `${l.source}->${l.target}`));
        setLineageData({ nodeIds, linkKeys });
        setLineageWarnings(data.warnings || []);
        setIsLineageLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLineageData(null);
        setLineageWarnings([]);
        setIsLineageLoading(false);
      });
  };

  const handleResetLineage = () => {
    setLineageData(null);
    setLineageWarnings([]);
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
              const isLineageLink = lineageData && (lineageData.linkKeys.has(`${link.sourceRef.id}->${link.targetRef.id}`) || lineageData.linkKeys.has(`${link.targetRef.id}->${link.sourceRef.id}`));
              const isDirectLink = selectedNode && (selectedNode.id === link.sourceRef.id || selectedNode.id === link.targetRef.id);
              
              let opacity = 0.40; // Default link opacity
              let strokeColor = link.label === 'AUDITS' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(255, 255, 255, 0.12)';
              let strokeWidth = 1.2;
              let strokeDasharray = 'none';

              if (lineageData) {
                if (isLineageLink) {
                  opacity = 0.95;
                  strokeColor = '#00b4d8';
                  strokeWidth = 2.2;
                  strokeDasharray = '4,3';
                } else {
                  opacity = 0.04;
                  strokeColor = 'rgba(255, 255, 255, 0.04)';
                }
              } else if (selectedNode) {
                opacity = isDirectLink ? 0.90 : 0.04;
                if (isDirectLink) {
                  strokeColor = '#00b4d8';
                  strokeWidth = 2.2;
                  strokeDasharray = '4,3';
                }
              }

              return (
                <line
                  key={`link-${idx}`}
                  x1={link.sourceRef.x}
                  y1={link.sourceRef.y}
                  x2={link.targetRef.x}
                  y2={link.targetRef.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  opacity={opacity}
                />
              );
            })}

            {/* B. Render link label tags on edge lines */}
            {displayLinks.map((link, idx) => {
              const isLineageLink = lineageData && (lineageData.linkKeys.has(`${link.sourceRef.id}->${link.targetRef.id}`) || lineageData.linkKeys.has(`${link.targetRef.id}->${link.sourceRef.id}`));
              const isDirectLink = selectedNode && (selectedNode.id === link.sourceRef.id || selectedNode.id === link.targetRef.id);
              
              let opacity = 0.35;
              if (lineageData) {
                opacity = isLineageLink ? 0.85 : 0.02;
              } else if (selectedNode) {
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
              const isLineageNode = lineageData && lineageData.nodeIds.has(node.id);
              
              // Fade out unselected nodes when a focus node is active (Bravoverse 15% opacity rule)
              let opacity = 1.0;
              if (lineageData) {
                opacity = isLineageNode ? 1.0 : 0.15;
              } else if (selectedNode && !isSelected) {
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

          {hoveredNode && (
            <div className="tooltip" style={{
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
                  <strong>Compliance:</strong> <span style={{ color: hoveredNode.status === 'Flagged' ? '#ef4444' : (hoveredNode.status === 'Pending' ? '#f59e0b' : '#10b981'), fontWeight: 'bold' }}>{hoveredNode.status.toUpperCase()}</span>
                </>
              )}
              {hoveredNode.type === 'field' && (
                <>
                  <strong>Variety:</strong> {hoveredNode.variety}<br/>
                  <strong>Status:</strong> <span style={{ color: hoveredNode.status === 'Flagged' ? '#ef4444' : (hoveredNode.status === 'Pending' ? '#f59e0b' : '#10b981'), fontWeight: 'bold' }}>{hoveredNode.status.toUpperCase()}</span><br/>
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

            {/* Lineage Trace Actions & Warnings */}
            <div style={{ display: 'flex', gap: '6px', margin: '4px 0 8px 0' }}>
              <button
                onClick={() => handleTraceLineage(selectedNode)}
                disabled={isLineageLoading}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0, 180, 216, 0.15)',
                  border: '1.5px solid rgba(0, 180, 216, 0.4)',
                  color: '#00b4d8',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  fontSize: '0.68rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.2s',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                {isLineageLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={10} /> Tracing...
                  </>
                ) : (
                  'Trace Downstream Lineage'
                )}
              </button>

              {lineageData && (
                <button
                  onClick={handleResetLineage}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1.5px solid rgba(239, 68, 68, 0.4)',
                    color: '#ef4444',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '0.68rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            {lineageData && lineageWarnings.length === 0 && (
              <div style={{
                margin: '4px 0 8px 0',
                border: '1.5px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
                padding: '6px 8px',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                fontSize: '0.62rem',
                color: '#10b981',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                textTransform: 'uppercase'
              }}>
                <CheckCircle size={12} /> No neighboring compliance warnings
              </div>
            )}

            {lineageWarnings.length > 0 && (
              <div style={{
                margin: '4px 0 8px 0',
                border: '1.5px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <span style={{
                  fontSize: '0.62rem',
                  color: '#ef4444',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  textTransform: 'uppercase'
                }}>
                  <AlertTriangle size={12} /> Neighbor Compliance Warnings ({lineageWarnings.length})
                </span>
                <table style={{ width: '100%', fontSize: '0.58rem', color: 'var(--text-secondary)', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'left' }}>
                      <th style={{ paddingBottom: '4px', fontWeight: 'bold' }}>Grower</th>
                      <th style={{ paddingBottom: '4px', fontWeight: 'bold' }}>Field</th>
                      <th style={{ paddingBottom: '4px', fontWeight: 'bold', textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineageWarnings.map((w, idx) => (
                      <tr key={idx} style={{ borderBottom: idx < lineageWarnings.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                        <td style={{ padding: '4px 0', fontWeight: 'bold', color: 'var(--text-primary)' }}>{w.growerName}</td>
                        <td style={{ padding: '4px 0' }}>{w.fieldName}</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', color: w.status === 'Flagged' ? '#ef4444' : '#f59e0b', fontWeight: 'bold' }}>{w.status.toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
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
                  {/* Precision Sustainability Ledger */}
                  {sustainabilityData && (
                    <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '8px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.62rem', color: 'var(--frito-gold)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Precision Sustainability Ledger
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.65rem' }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.55rem' }}>Water-Use Efficiency</span>
                          <strong>{sustainabilityData.waterUseEfficiency !== null ? `${sustainabilityData.waterUseEfficiency} Tons/m³` : 'N/A'}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.55rem' }}>Transit Carbon Footprint</span>
                          <strong>{sustainabilityData.carbonFootprint !== null ? `${sustainabilityData.carbonFootprint} kg CO₂` : 'N/A'}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', marginTop: '2px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem' }}>Runoff Risk Warning:</span>
                        <span style={{ 
                          fontWeight: 'bold', 
                          color: sustainabilityData.soilRunoffRisk === 'High' ? '#ef4444' : (sustainabilityData.soilRunoffRisk === 'Medium' ? '#f59e0b' : '#10b981')
                        }}>
                          {sustainabilityData.soilRunoffRisk}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Holistic Health Scorecard Section */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', borderTop: '1px solid var(--border-card)', paddingTop: '10px' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--frito-gold)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Holistic Health & Advisor
                    </span>
                    <button
                      onClick={() => fetchHolisticHealth(selectedNode.label, selectedNode.ndvi, selectedNode.soilMoisture)}
                      disabled={isHealthLoading}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: isHealthLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.58rem',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      }}
                    >
                      <RefreshCw size={10} className={isHealthLoading ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  </div>

                  {isHealthLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', gap: '8px', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      <Loader2 className="animate-spin" size={14} color="var(--frito-gold)" />
                      <span>Analyzing Holistic Health...</span>
                    </div>
                  ) : healthError ? (
                    <div style={{ color: '#ef4444', fontSize: '0.65rem', padding: '4px' }}>
                      Error loading health metrics: {healthError}
                    </div>
                  ) : holisticHealth ? (
                    <>
                      {/* Stylized Grade Badge & Label Row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                        <div style={(() => {
                          let color = '#ef4444';
                          let bgColor = 'rgba(239, 68, 68, 0.15)';
                          let borderColor = '#ef4444';
                          
                          if (holisticHealth.score === 'A') {
                            color = '#10b981';
                            bgColor = 'rgba(16, 185, 129, 0.15)';
                            borderColor = '#10b981';
                          } else if (holisticHealth.score === 'B') {
                            color = '#10b981';
                            bgColor = 'rgba(16, 185, 129, 0.1)';
                            borderColor = 'rgba(16, 185, 129, 0.7)';
                          } else if (holisticHealth.score === 'C') {
                            color = '#f59e0b';
                            bgColor = 'rgba(245, 158, 11, 0.15)';
                            borderColor = '#f59e0b';
                          } else if (holisticHealth.score === 'D') {
                            color = '#f97316';
                            bgColor = 'rgba(249, 115, 22, 0.15)';
                            borderColor = '#f97316';
                          }
                          
                          return {
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            border: `2px solid ${borderColor}`,
                            backgroundColor: bgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.25rem',
                            fontWeight: '900',
                            color: color,
                            boxShadow: `0 0 10px ${borderColor}20`
                          };
                        })()}>
                          {holisticHealth.score}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Holistic Health Grade</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#ffffff' }}>
                            {holisticHealth.score === 'A' ? 'Optimal Performance' : holisticHealth.score === 'B' ? 'Good Performance' : holisticHealth.score === 'C' ? 'Mild Stress Warning' : 'Critical Action Required'}
                          </span>
                        </div>
                      </div>

                      {/* Checklist of Components */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px', backgroundColor: 'var(--bg-secondary)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-card)' }}>
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>
                          Metric Compliance Checklist
                        </span>
                        
                        {/* NDVI */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem' }}>
                          {selectedNode.ndvi >= 0.60 ? (
                            <CheckCircle size={12} color="#10b981" />
                          ) : (
                            <AlertTriangle size={12} color="#f59e0b" />
                          )}
                          <span style={{ color: selectedNode.ndvi >= 0.60 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            Vegetation Index (NDVI: {selectedNode.ndvi})
                          </span>
                        </div>

                        {/* Soil Moisture */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem' }}>
                          {selectedNode.soilMoisture >= 15 ? (
                            <CheckCircle size={12} color="#10b981" />
                          ) : (
                            <AlertTriangle size={12} color="#f59e0b" />
                          )}
                          <span style={{ color: selectedNode.soilMoisture >= 15 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            Soil Moisture ({selectedNode.soilMoisture}%)
                          </span>
                        </div>

                        {/* Audit Status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem' }}>
                          {selectedNode.status !== 'Flagged' ? (
                            <CheckCircle size={12} color="#10b981" />
                          ) : (
                            <AlertTriangle size={12} color="#ef4444" />
                          )}
                          <span style={{ color: selectedNode.status !== 'Flagged' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            Audit Status ({selectedNode.status.toUpperCase()})
                          </span>
                        </div>
                      </div>

                      {/* Gold-Bordered Advisor Card */}
                      <div style={{
                        marginTop: '10px',
                        border: '1.5px solid var(--frito-gold)',
                        borderRadius: '8px',
                        padding: '10px',
                        backgroundColor: 'rgba(255, 208, 0, 0.03)',
                        boxShadow: '0 4px 12px rgba(255, 208, 0, 0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Sparkles size={12} color="var(--frito-gold)" />
                          <span style={{ fontSize: '0.62rem', color: 'var(--frito-gold)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Gemini Agronomic Advisory
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                          {holisticHealth.advisory}
                        </p>
                      </div>
                    </>
                  ) : null}

                  {/* BigQuery Property Graph Dynamic Timeline */}
                  <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-card)', paddingTop: '10px' }}>
                    <span style={{ 
                      fontSize: '0.62rem', 
                      color: 'var(--frito-gold)', 
                      fontWeight: 'bold', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px',
                      marginBottom: '8px',
                      textTransform: 'uppercase' 
                    }}>
                      <Sparkles size={9} /> BQ Graph Crop Timeline
                    </span>
                    
                    {isTimelineLoading ? (
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', padding: '4px' }}>Loading timeline...</div>
                    ) : timelineData.length === 0 ? (
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', padding: '4px' }}>No timeline data found for this plot.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', paddingLeft: '10px', borderLeft: '1.5px dashed rgba(255, 208, 0, 0.2)' }}>
                        {timelineData.map((event, idx) => (
                          <div key={event.logId} style={{ position: 'relative', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                            {/* Dot indicator */}
                            <div style={{ 
                              position: 'absolute', 
                              left: '-14px', 
                              top: '3px', 
                              width: '7px', 
                              height: '7px', 
                              borderRadius: '50%', 
                              backgroundColor: event.status === 'Flagged' ? '#ef4444' : (event.status === 'Pending' ? '#f59e0b' : '#10b981'),
                              border: '1.5px solid var(--bg-card)'
                            }} />
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '1px' }}>
                              <span>{event.stage}</span>
                              <span style={{ 
                                fontSize: '0.55rem', 
                                color: event.status === 'Flagged' ? '#ef4444' : (event.status === 'Pending' ? '#f59e0b' : '#10b981')
                              }}>{event.status.toUpperCase()}</span>
                            </div>
                            
                            {event.stage === 'Seeding' && (
                              <p style={{ margin: 0, fontSize: '0.58rem', lineHeight: 1.2 }}>
                                Variety: <strong>{event.variety}</strong><br />
                                Treatment: <strong>{event.seedTreatments || 'None'}</strong>
                              </p>
                            )}
                            {event.stage === 'Application' && (
                              <p style={{ margin: 0, fontSize: '0.58rem', lineHeight: 1.2 }}>
                                Fertilizer: <strong>{event.fertilizer || 'None'}</strong><br />
                                Pesticide: <strong>{event.pesticide || 'None'}</strong>
                              </p>
                            )}
                            {event.stage === 'Harvest' && (
                              <p style={{ margin: 0, fontSize: '0.58rem', lineHeight: 1.2 }}>
                                Yield: <strong>{event.yield} Tons</strong> | Moisture: <strong>{event.moisture}%</strong><br />
                                Defects: <strong>{event.defectRate}%</strong>
                              </p>
                            )}
                            
                            <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', display: 'block', marginTop: '1px' }}>
                              {new Date(event.timestamp.value || event.timestamp).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
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
                    <strong style={{ 
                      color: selectedNode.status === 'Flagged' ? '#ef4444' : (selectedNode.status === 'Pending' ? '#f59e0b' : '#10b981'), 
                      fontSize: '0.78rem' 
                    }}>
                      {selectedNode.status === 'Flagged' ? '⚠️ AUDIT INGESTION FAILURE' : (selectedNode.status === 'Pending' ? '⚠ PENDING COMPLIANCE REVIEW' : '✓ VALID APPROVED SUPPLIER')}
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
