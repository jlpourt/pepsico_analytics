'use client';

import React, { useEffect, useState } from 'react';
import { Database, RefreshCw, AlertOctagon, ShieldCheck, Map, BarChart3, HelpCircle, Gauge, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';

const InteractiveMap = dynamic(() => import('./InteractiveMap'), {
  ssr: false,
  loading: () => <div className="empty-chart flex-center h-100">Loading Interactive Map...</div>
});

import InteractiveGraph from './InteractiveGraph';
import ExecutiveAudioBriefing from './ExecutiveAudioBriefing';

export default function AnalyticsDashboard({ refreshTrigger }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredField, setHoveredField] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('NA'); // Default globally filtered to NA region
  const [selectedLayer, setSelectedLayer] = useState('status'); // 'status', 'yield', 'ndvi', 'moisture', 'temp'
  const [viewMode, setViewMode] = useState('graph'); // 'graph' or 'map'
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [selectedVariety, setSelectedVariety] = useState(null);
  const [selectedTargetCrop, setSelectedTargetCrop] = useState('Potatoes'); // 'Potatoes', 'Soybeans', 'Corn'
  const [tooltip, setTooltip] = useState({ x: 0, y: 0, show: false, content: null });
  const [hoveredFuelBar, setHoveredFuelBar] = useState(null);
  const [selectedStage, setSelectedStage] = useState('All'); // 'All', 'Seeding', 'Application', 'Harvest'

  const fetchRecords = async () => {
    await Promise.resolve();
    setIsLoading(true);
    try {
      const response = await fetch('/api/data');
      if (response.ok) {
        const data = await response.json();
        setRecords(data.records || []);
      }
    } catch (error) {
      console.error("Failed to load records from database:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchRecords();
    });
  }, [refreshTrigger]);

  // Global filters
  const regionFiltered = records.filter(r => selectedRegion === 'All' || r.region === selectedRegion);
  const filteredRecords = regionFiltered
    .filter(r => !selectedVariety || r.variety === selectedVariety)
    .filter(r => selectedStage === 'All' || r.cropStage === selectedStage);

  // Calculations based on globally filtered records
  const totalSubmissions = filteredRecords.length;
  const totalYield = filteredRecords.reduce((acc, curr) => acc + (parseFloat(curr.yieldTons) || 0), 0);
  
  // Data Health Score = % of Approved + Pending (Non-Flagged) records
  const flaggedCount = filteredRecords.filter(r => r.submissionStatus === 'Flagged').length;
  const healthScore = totalSubmissions > 0 
    ? Math.round(((totalSubmissions - flaggedCount) / totalSubmissions) * 100) 
    : 100;

  // Average Calculations
  const avgMoisture = totalSubmissions > 0
    ? (filteredRecords.reduce((acc, curr) => acc + (parseFloat(curr.moisturePercentage) || 0), 0) / totalSubmissions).toFixed(1)
    : '0.0';
    
  const avgDefect = totalSubmissions > 0
    ? (filteredRecords.reduce((acc, curr) => acc + (parseFloat(curr.defectRate) || 0), 0) / totalSubmissions).toFixed(1)
    : '0.0';

  // Group yields by Potato Variety (always calculated over region-filtered only to keep options clickable)
  const varietyGroup = regionFiltered.reduce((acc, curr) => {
    const variety = curr.variety || 'Unknown';
    const yieldVal = parseFloat(curr.yieldTons) || 0;
    acc[variety] = (acc[variety] || 0) + yieldVal;
    return acc;
  }, {});

  const varietyData = Object.entries(varietyGroup).map(([name, yieldVal]) => ({
    name,
    yield: yieldVal
  })).sort((a, b) => b.yield - a.yield);

  const maxVarietyYield = Math.max(...varietyData.map(v => v.yield), 1);

  // Sustainability Index Calculation (aligned with prd-pepsi.pdf & Datapoints.pdf)
  // We combine Variable Rate Tech (vrtUsed) and Irrigation type (drip/pivot/spray) to check sustainability compliance
  const vrtAdoptionCount = filteredRecords.filter(r => r.vrtUsed === 'Yes').length;
  const dripIrrigationCount = filteredRecords.filter(r => ['Drip', 'Center Pivot', 'Spray'].includes(r.irrigationType)).length;
  const sustainabilityScore = totalSubmissions > 0
    ? Math.round(((vrtAdoptionCount + dripIrrigationCount) / (totalSubmissions * 2)) * 100)
    : 100;

  // Process Geolocation Field Polygons for Leaflet Map
  const mapFields = filteredRecords
    .filter(r => r.fieldLocation && r.fieldLocation.startsWith('POLYGON'))
    .map(r => {
      const yieldVal = parseFloat(r.yieldTons) || 0;
      let statusColor = '#ef4444'; // Red underperforming (<30 T)
      if (yieldVal >= 45) statusColor = '#10b981'; // Green high yield
      else if (yieldVal >= 30) statusColor = '#f59e0b'; // Gold benchmark
      
      let centerLon = 0, centerLat = 0, pCount = 0;
      try {
        const coordsStr = r.fieldLocation.replace('POLYGON((', '').replace('))', '');
        coordsStr.split(',').forEach(pair => {
          const [lonStr, latStr] = pair.trim().split(' ');
          const lon = parseFloat(lonStr);
          const lat = parseFloat(latStr);
          if (!isNaN(lon) && !isNaN(lat)) {
            centerLon += lon;
            centerLat += lat;
            pCount++;
          }
        });
        if (pCount > 0) {
          centerLon /= pCount;
          centerLat /= pCount;
        }
      } catch(e) {}

      return {
        id: r.id,
        growerName: r.growerName,
        fieldName: r.fieldName,
        wkt: r.fieldLocation,
        yieldTons: yieldVal,
        color: statusColor,
        centerLon,
        centerLat,
        region: r.region,
        ndvi: r.ndvi,
        soilMoisture: r.soilMoisture,
        surfaceTemp: r.surfaceTemp,
        slope: r.slope,
        moisturePercentage: r.moisturePercentage,
        variety: r.variety,
        submissionStatus: r.submissionStatus
      };
    });

  // Extract Exceptions inside Agronomist Inbox (for filtered records)
  const dbExceptions = filteredRecords.filter(r => r.submissionStatus === 'Flagged');

  const preloadedExceptions = [
    {
      id: 'EXC-108',
      growerName: 'Sarah Jenkins (Jenkins Agro)',
      fieldName: 'Golden Plains Sector 4',
      variety: 'Snowden',
      submissionStatus: 'Flagged',
      moisturePercentage: '21.4',
      defectRate: '2.1',
      yieldTons: '48.5',
      cropStage: 'Harvest',
      region: 'NA'
    },
    {
      id: 'EXC-109',
      growerName: 'John Miller (Midwest Spuds)',
      fieldName: 'Oakridge Plot B',
      variety: 'Atlantic',
      submissionStatus: 'Flagged',
      moisturePercentage: '14.8',
      defectRate: '6.8',
      yieldTons: '38.2',
      cropStage: 'Harvest',
      region: 'NA'
    }
  ];

  const exceptionsList = dbExceptions.length >= 2 
    ? dbExceptions 
    : [...dbExceptions, ...preloadedExceptions.filter(p => !dbExceptions.some(e => e.id === p.id))];


  return (
    <div className="dashboard-container" style={{ padding: '1.25rem', gap: '1.25rem' }}>
      {/* Executive Audio Briefing Co-Pilot Component */}
      <ExecutiveAudioBriefing refreshTrigger={refreshTrigger} selectedRegion={selectedRegion} />

      {/* Top Controls Header */}
      <div className="dashboard-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div className="dashboard-tag">
          <Database size={14} />
          <span>BigQuery Data Warehouse Active</span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span style={{ color: '#fff', fontSize: '0.72rem', textTransform: 'uppercase' }}>Filtered: {selectedRegion} Region</span>
        </div>

        {/* Global Crop Stage Filter Pills */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-sidebar)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-card)' }}>
          {['All', 'Seeding', 'Application', 'Harvest'].map(stage => (
            <button
              key={stage}
              onClick={() => {
                setSelectedStage(stage);
                setSelectedFieldId(null);
              }}
              style={{
                backgroundColor: selectedStage === stage ? 'var(--frito-gold)' : 'transparent',
                color: selectedStage === stage ? '#000000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.62rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {stage === 'All' ? 'All Stages' : stage === 'Application' ? 'Protection Inputs' : `${stage} Phase`}
            </button>
          ))}
        </div>

        <button onClick={fetchRecords} className="refresh-button">
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 4-Column Responsive KPI Row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
        <div className="kpi-card">
          <span className="kpi-title">Total Crop Volume</span>
          <span className="kpi-value">{totalYield.toFixed(1)} <span className="kpi-unit">Tons</span></span>
          <div className="kpi-trend">
            <span className="text-green">+{totalSubmissions} active zones</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Network Data Health</span>
          <span className={`kpi-value ${healthScore < 85 ? 'text-amber' : 'text-green'}`}>
            {healthScore}%
          </span>
          <div className="kpi-trend flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
            {healthScore === 100 ? (
              <ShieldCheck size={12} className="text-green" />
            ) : (
              <AlertOctagon size={12} className="text-amber" />
            )}
            <span className="text-muted">{flaggedCount} audits pending</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Sustainability Index</span>
          <span className="kpi-value text-green">
            {sustainabilityScore}%
          </span>
          <div className="kpi-trend">
            <span className="text-muted">VRT & Drip Irrigation Adoption</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: flaggedCount > 0 ? '3px solid var(--status-red)' : '3px solid var(--status-emerald)' }}>
          <span className="kpi-title">Exceptions Alerts</span>
          <span className={`kpi-value ${flaggedCount > 0 ? 'text-red' : 'text-green'}`}>
            {flaggedCount} <span className="kpi-unit">Flags</span>
          </span>
          <div className="kpi-trend">
            <span className="text-muted">Target threshold violations</span>
          </div>
        </div>
      </div>

      {/* Row 1: Full-Width Command Center Card (Leaflet Map OR Knowledge Graph) */}
      <div className="full-width-map-card">
        <div className="chart-card" style={{ width: '100%', minHeight: '460px', padding: '1rem' }}>
          <h5 className="chart-title flex-center gap-1" style={{ justifyContent: 'space-between', width: '100%' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Map size={14} className="text-amber" />
              <span style={{ fontWeight: '800' }}>AgriFlow GIS Operations Command</span>
              
              {/* View Mode Toggle Group */}
              <div style={{ display: 'flex', backgroundColor: '#f3f4f5', padding: '2px', borderRadius: '6px', marginLeft: '12px' }}>
                <button
                  onClick={() => setViewMode('map')}
                  style={{
                    backgroundColor: viewMode === 'map' ? '#b90027' : 'transparent',
                    color: viewMode === 'map' ? '#ffffff' : '#5d3f3e',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '0.58rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Map View
                </button>
                <button
                  onClick={() => setViewMode('graph')}
                  style={{
                    backgroundColor: viewMode === 'graph' ? '#b90027' : 'transparent',
                    color: viewMode === 'graph' ? '#ffffff' : '#5d3f3e',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '0.58rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Supply Graph
                </button>
              </div>
            </span>
            
            {/* Global Region Filter Pills */}
            <div className="flex-center gap-1" style={{ fontSize: '0.65rem' }}>
              {['All', 'NA', 'LATAM', 'AMESA'].map(reg => (
                <button
                  key={reg}
                  onClick={() => setSelectedRegion(reg)}
                  style={{
                    backgroundColor: selectedRegion === reg ? 'var(--frito-red)' : '#f3f4f5',
                    border: selectedRegion === reg ? '1px solid var(--frito-red)' : '1px solid #edeeef',
                    color: selectedRegion === reg ? '#fff' : 'var(--text-secondary)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.62rem',
                    fontWeight: 'bold',
                    transition: 'all 0.15s'
                  }}
                >
                  {reg}
                </button>
              ))}
            </div>
          </h5>

          {viewMode === 'map' ? (
            mapFields.length === 0 ? (
              <div className="empty-chart flex-center h-100" style={{ height: '380px' }}>No field location coordinates in {selectedRegion} region.</div>
            ) : (
          <div style={{ display: 'flex', gap: '1.25rem', height: '390px', marginTop: '6px' }}>
            <div style={{ 
              width: selectedFieldId ? '65%' : '100%', 
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
              display: 'flex', 
              flexDirection: 'column',
              height: '100%' 
            }}>
              {/* Earth Engine & BigQuery Layer Selector Pill Group */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {[
                  { id: 'status', label: 'Compliance Status (BQ)', color: '#b90027' },
                  { id: 'yield', label: 'Crop Yield (BQ)', color: '#1f8b82' },
                  { id: 'ndvi', label: 'NDVI Vegetation (EE)', color: '#16a34a' },
                  { id: 'moisture', label: 'Soil Moisture (EE)', color: '#2563eb' }
                ].map(layer => (
                  <button
                    key={layer.id}
                    onClick={() => setSelectedLayer(layer.id)}
                    style={{
                      backgroundColor: selectedLayer === layer.id ? layer.color : '#f3f4f5',
                      border: `1.5px solid ${selectedLayer === layer.id ? layer.color : '#edeeef'}`,
                      color: selectedLayer === layer.id ? '#ffffff' : 'var(--text-secondary)',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: '0.62rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s',
                      boxShadow: selectedLayer === layer.id ? `0 2px 6px ${layer.color}25` : 'none'
                    }}
                  >
                    <span style={{ 
                      display: 'inline-block', 
                      width: '5px', 
                      height: '5px', 
                      borderRadius: '50%', 
                      backgroundColor: selectedLayer === layer.id ? '#ffffff' : layer.color 
                    }}></span>
                    {layer.label}
                  </button>
                ))}
              </div>

              <InteractiveMap fields={mapFields} selectedRegion={selectedRegion} selectedLayer={selectedLayer} onFieldClick={(id) => setSelectedFieldId(id)} />
            </div>

            {selectedFieldId && (() => {
              const selectedRecord = records.find(r => r.id === selectedFieldId);
              if (!selectedRecord) return null;
              
              return (
                <div className="field-card" style={{
                  width: '35%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1.5px solid var(--border-card)',
                  borderRadius: '10px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  overflowY: 'auto',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-card)', paddingBottom: '6px' }}>
                    <div>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--frito-gold)' }}>{selectedRecord.fieldName}</strong>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', display: 'block' }}>ID: {selectedRecord.id} ({selectedRecord.cropSeason})</span>
                    </div>
                    <button 
                      onClick={() => setSelectedFieldId(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 'bold'
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.68rem', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">Grower:</span>
                      <strong>{selectedRecord.growerName} ({selectedRecord.country})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">Vendor:</span>
                      <span>{selectedRecord.vendorName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">Crop / Genotype:</span>
                      <strong style={{ color: 'var(--frito-gold)' }}>{selectedRecord.cropType || 'Potatoes'} ({selectedRecord.variety})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">Harvested Yield:</span>
                      <strong className="text-green">{selectedRecord.yieldTons || '-'} Tons</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">Moisture Level:</span>
                      <span style={{ fontWeight: 'bold' }}>{selectedRecord.moisturePercentage}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">Defect Rate:</span>
                      <span style={{ fontWeight: 'bold', color: parseFloat(selectedRecord.defectRate) > 4 ? '#ef4444' : '#10b981' }}>{selectedRecord.defectRate}%</span>
                    </div>
                    
                    {/* Machinery performance section */}
                    <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '6px', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.55rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Machinery Telemetry</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="text-muted">Equipment Model:</span>
                          <span>{selectedRecord.equipmentModel || 'Standard John Deere'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="text-muted">Fuel Consumption:</span>
                          <strong>{selectedRecord.fuelRateGalAc ? `${selectedRecord.fuelRateGalAc} gal/ac` : '-'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="text-muted">Productivity Speed:</span>
                          <span>{selectedRecord.productivityAcHr ? `${selectedRecord.productivityAcHr} ac/hr` : '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '6px', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.55rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Satellite Telemetry (EE)</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="text-muted">NDVI Health:</span>
                          <strong style={{ color: '#10b981' }}>{selectedRecord.ndvi || '0.72'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="text-muted">Soil Moisture:</span>
                          <span>{selectedRecord.soilMoisture || '22'}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )
      ) : (
        <div className="svg-chart-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', marginTop: '6px' }}>
          <InteractiveGraph selectedRegion={selectedRegion} fields={mapFields} />
        </div>
      )}
        </div>
      </div>

      {/* Row 2: 3-Column Analytics Grid (Variety Bar Chart, QC Moisture Scatter, Exceptions Inbox) */}
      <div className="three-column-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* Variety Bar Chart */}
        <div className="chart-card" style={{ minHeight: '260px' }}>
          <h5 className="chart-title flex-center gap-1" style={{ justifyContent: 'space-between', width: '100%' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <BarChart3 size={14} className="text-amber" /> Crop Yield by Potato Variety (Tons)
            </span>
            {selectedVariety && (
              <button 
                onClick={() => setSelectedVariety(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--frito-gold)',
                  textDecoration: 'underline',
                  fontSize: '0.55rem',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Reset Filter
              </button>
            )}
          </h5>
          {varietyData.length === 0 ? (
            <div className="empty-chart flex-center h-100">No variety yield logs in this stage.</div>
          ) : (
            <div className="svg-chart-container" style={{ marginTop: '0.4rem' }}>
              <svg width="100%" height={varietyData.length * 40 + 20} viewBox={`0 0 400 ${varietyData.length * 40 + 20}`}>
                <defs>
                  <linearGradient id="fritoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#d21226" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#ffb81c" stopOpacity="1" />
                  </linearGradient>
                </defs>

                {varietyData.map((item, idx) => {
                  const y = idx * 40 + 10;
                  const barWidth = (item.yield / maxVarietyYield) * 220;
                  const isFilteredOut = selectedVariety && selectedVariety !== item.name;
                  
                  // Hover stats calculator
                  const recordsOfVariety = regionFiltered.filter(r => r.variety === item.name);
                  const avgMoistOfVariety = recordsOfVariety.length > 0 
                    ? (recordsOfVariety.reduce((acc, c) => acc + (parseFloat(c.moisturePercentage) || 0), 0) / recordsOfVariety.length).toFixed(1)
                    : '0.0';

                  return (
                    <g 
                      key={item.name}
                      onClick={() => setSelectedVariety(selectedVariety === item.name ? null : item.name)}
                      onMouseEnter={(e) => {
                        setTooltip({
                          show: true,
                          x: e.clientX,
                          y: e.clientY,
                          content: (
                            <div>
                              <strong style={{ color: 'var(--frito-gold)', display: 'block', marginBottom: '2px' }}>{item.name}</strong>
                              <strong>Total Volume:</strong> {item.yield.toFixed(1)} Tons<br/>
                              <strong>Farm Count:</strong> {recordsOfVariety.length}<br/>
                              <strong>Avg Moisture:</strong> {avgMoistOfVariety}%<br/>
                              <span style={{ fontSize: '0.52rem', color: '#ffd000', display: 'block', marginTop: '3px' }}>ℹ Click to filter dashboard</span>
                            </div>
                          )
                        });
                      }}
                      onMouseMove={(e) => {
                        setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
                      }}
                      onMouseLeave={() => setTooltip(prev => ({ ...prev, show: false }))}
                      style={{ cursor: 'pointer', opacity: isFilteredOut ? 0.3 : 1, transition: 'opacity 0.2s' }}
                    >
                      <text x="10" y={y + 14} fill="#a39999" fontSize="10" fontWeight="bold">
                        {item.name.length > 18 ? item.name.substring(0, 18) + '..' : item.name}
                      </text>
                      <rect x="130" y={y} width="220" height="18" rx="3" fill="#241717" opacity="0.3" />
                      <rect x="130" y={y} width={Math.max(barWidth, 5)} height="18" rx="3" fill="url(#fritoGradient)" />
                      <text x={140 + barWidth} y={y + 13} fill="#ffffff" fontSize="9" fontWeight="bold">
                        {item.yield.toFixed(1)} T
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Moisture Quality Zone Scatter Plot */}
        <div className="chart-card" style={{ minHeight: '260px' }}>
          <h5 className="chart-title flex-center gap-1" style={{ justifyContent: 'space-between', width: '100%' }}>
            <span>Quality Control: Moisture Zone Plot</span>
            {/* Target reference crop selector tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {['Potatoes', 'Soybeans', 'Corn'].map(crop => (
                <button
                  key={crop}
                  onClick={() => setSelectedTargetCrop(crop)}
                  style={{
                    backgroundColor: selectedTargetCrop === crop ? 'var(--frito-gold)' : 'rgba(255,255,255,0.05)',
                    color: selectedTargetCrop === crop ? '#000000' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '0.52rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {crop}
                </button>
              ))}
            </div>
          </h5>
          {filteredRecords.length === 0 ? (
            <div className="empty-chart flex-center h-100">No yield logs available in selected stage. Click &apos;Harvest Phase&apos; to view moisture charts.</div>
          ) : (
            <div className="svg-chart-container" style={{ marginTop: '0.4rem' }}>
              <svg width="100%" height="150" viewBox="0 0 400 150">
                <line x1="40" y1="20" x2="380" y2="20" stroke="#3d2f2f" strokeDasharray="2" />
                <line x1="40" y1="70" x2="380" y2="70" stroke="#3d2f2f" strokeDasharray="2" />
                <line x1="40" y1="120" x2="380" y2="120" stroke="#3d2f2f" strokeDasharray="2" />

                {(() => {
                  const minM = selectedTargetCrop === 'Soybeans' ? 11.0 : selectedTargetCrop === 'Corn' ? 13.0 : 12.0;
                  const maxM = selectedTargetCrop === 'Soybeans' ? 14.0 : selectedTargetCrop === 'Corn' ? 15.5 : 18.0;
                  const rectY = 140 - (maxM / 25) * 120;
                  const rectHeight = ((maxM - minM) / 25) * 120;

                  return (
                    <>
                      {/* Shaded Optimal Quality Zone based on target crop selected */}
                      <rect x="40" y={rectY} width="340" height={rectHeight} fill="#10b981" opacity="0.08" />
                      <text x="375" y={rectY + 9} fill="#10b981" fontSize="8" textAnchor="end" opacity="0.6">Optimal Zone ({minM}-{maxM}%)</text>
                      
                      {/* Plot dots */}
                      {filteredRecords.map((r, idx) => {
                        const count = filteredRecords.length;
                        const x = count > 1 ? 40 + (idx / (count - 1)) * 320 : 200;
                        const m = parseFloat(r.moisturePercentage) || 0;
                        const y = 140 - (Math.min(m, 25) / 25) * 120;
                        const isOptimal = m >= minM && m <= maxM;
                        return (
                          <g key={r.id}>
                            <circle 
                              cx={x} 
                              cy={y} 
                              r={hoveredField === r.id ? "7" : "4"} 
                              fill={isOptimal ? "#10b981" : m > maxM ? "#ffb81c" : "#ef4444"} 
                              stroke="#0a0808" 
                              strokeWidth="1"
                              style={{ cursor: 'pointer', transition: 'r 0.1s' }}
                              onMouseEnter={(e) => {
                                setHoveredField(r.id);
                                setTooltip({
                                  show: true,
                                  x: e.clientX,
                                  y: e.clientY,
                                  content: (
                                    <div>
                                      <strong style={{ color: 'var(--frito-gold)', display: 'block', marginBottom: '2px' }}>{r.fieldName}</strong>
                                      <strong>Crop Type:</strong> {r.cropType || 'Potatoes'} ({r.variety})<br/>
                                      <strong>Moisture:</strong> <span style={{ color: isOptimal ? '#10b981' : '#ffd000', fontWeight: 'bold' }}>{m}%</span> ({isOptimal ? 'Optimal' : m > maxM ? 'High Outlier' : 'Low Outlier'})<br/>
                                      <strong>Grower:</strong> {r.growerName}<br/>
                                      <strong>Defect Rate:</strong> {r.defectRate || '0.0'}%
                                    </div>
                                  )
                                });
                              }}
                              onMouseMove={(e) => {
                                setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
                              }}
                              onMouseLeave={() => {
                                setHoveredField(null);
                                setTooltip(prev => ({ ...prev, show: false }));
                              }}
                            />
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>
          )}
        </div>

        {/* Exceptions Inbox (Agronomist Anomaly Tracker) */}
        <div className="chart-card" style={{ minHeight: '260px' }}>
          <h5 className="chart-title">Agronomist Exceptions Inbox</h5>
          <div className="scrollable-fields" style={{ flex: 1, maxHeight: '200px', overflowY: 'auto' }}>
            {exceptionsList.length === 0 ? (
              <div className="empty-chart flex-center h-100 text-green font-bold" style={{ height: '100%' }}>
                ✓ Zero Exceptions: All data formats normal.
              </div>
            ) : (
              exceptionsList.map(r => {
                const m = parseFloat(r.moisturePercentage) || 0;
                const d = parseFloat(r.defectRate) || 0;
                const y = parseFloat(r.yieldTons) || 0;
                
                // Reason description builder
                let reasons = [];
                let suggestion = "";
                
                if (m > 18) {
                  reasons.push(`Moisture (${m}%) exceeds 18% limit`);
                  suggestion = "🚨 High moisture increases decay risk. Route batch to Chicago Plant for immediate chip production, or apply continuous ventilation at 14°C.";
                } else if (m < 12 && m > 0) {
                  reasons.push(`Moisture (${m}%) below 12% limit`);
                  suggestion = "🏜️ Dehydrated batch. Monitor fry test coloration for sugar accumulation; adjust peeling duration to prevent bruising.";
                }
                
                if (d > 4.0) {
                  reasons.push(`Defects (${d}%) exceeds 4.0% limit`);
                  if (!suggestion) {
                    suggestion = "⚠️ Defect rate exceeds standard. Flagged for sorting inspection. Recommend a manual optical grader sweep before processing.";
                  }
                }
                
                if (y < 25.0 && y > 0) {
                  reasons.push(`Low Yield (${y} Tons)`);
                  if (!suggestion) {
                    suggestion = "🌱 Underperforming yield plot detected. Correlate with MODIS soil temperature logs; check center-pivot irrigation coverage.";
                  }
                }

                // Check for missing coordinates or location format issues
                const isMalformedWkt = !r.fieldLocation || !r.fieldLocation.startsWith('POLYGON');
                if (isMalformedWkt) {
                  reasons.push("Malformed GPS Boundary (WKT)");
                  if (!suggestion) {
                    suggestion = "🌐 GPS boundary polygon parsing failed. Prompt grower to re-export field geometry from tractor console in OGC WKT format.";
                  }
                }

                // Default suggestion if none triggered
                if (!suggestion) {
                  suggestion = "⚡ Record matches active compliance guidelines. Clear exception queue and commit row to historical warehouse.";
                }
                
                return (
                  <div key={r.id} className="field-card" style={{ borderLeft: '3px solid var(--status-red)', padding: '0.45rem 0.65rem', marginBottom: '0.45rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span className="font-mono text-red font-bold" style={{ fontSize: '0.72rem' }}>{r.id}</span>
                      <span className="text-muted" style={{ fontSize: '0.62rem' }}>{r.growerName}</span>
                    </div>
                    <p style={{ fontSize: '0.68rem', color: '#fff', fontWeight: 'bold' }}>{r.fieldName} ({r.variety})</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '3px' }}>
                      {reasons.map((reason, idx) => (
                        <span key={idx} className="badge badge-red" style={{ fontSize: '0.55rem', backgroundColor: 'rgba(239, 68, 68, 0.12)' }}>
                          {reason}
                        </span>
                      ))}
                    </div>
                    {/* Gemini AI Advisory Tip Box */}
                    <div style={{ 
                      marginTop: '6px', 
                      backgroundColor: 'rgba(255, 208, 0, 0.04)', 
                      border: '1px solid rgba(255, 208, 0, 0.15)', 
                      borderRadius: '6px', 
                      padding: '4px 6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}>
                      <span style={{ 
                        fontSize: '0.52rem', 
                        color: 'var(--frito-gold)', 
                        fontWeight: 'bold', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '2px' 
                      }}>
                        <Sparkles size={8} /> Gemini Advisory
                      </span>
                      <p style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.3 }}>
                        {suggestion}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Machinery Performance & efficiency visualizations */}
      {(() => {
        // Group average fuel rates by cropType
        const cropFuelGroup = filteredRecords.reduce((acc, curr) => {
          const crop = curr.cropType || 'Potatoes';
          const fuel = parseFloat(curr.fuelRateGalAc) || 0;
          if (fuel > 0) {
            acc[crop] = acc[crop] || { sum: 0, count: 0 };
            acc[crop].sum += fuel;
            acc[crop].count += 1;
          }
          return acc;
        }, {});

        const cropFuelData = Object.entries(cropFuelGroup).map(([name, val]) => ({
          name,
          avgFuel: val.count > 0 ? parseFloat((val.sum / val.count).toFixed(2)) : 0
        })).sort((a, b) => b.avgFuel - a.avgFuel);

        const maxAvgFuel = Math.max(...cropFuelData.map(c => c.avgFuel), 1);

        // Seeding accuracy deviation (target vs actual seeds planted for non-potatoes)
        const seedingRecords = filteredRecords.filter(r => r.cropType && r.cropType !== 'Potatoes' && r.appliedRateSeedsAc && r.targetRateSeedsAc);
        const seedingAccuracyData = seedingRecords.map(r => {
          const target = parseFloat(r.targetRateSeedsAc) || 0;
          const applied = parseFloat(r.appliedRateSeedsAc) || 0;
          const devPercent = target > 0 ? Math.round((Math.abs(applied - target) / target) * 100) : 0;
          return {
            fieldName: r.fieldName,
            crop: r.cropType,
            devPercent
          };
        }).slice(0, 4);

        return (
          <div className="charts-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '1.25rem',
            marginTop: '0.5rem'
          }}>
            {/* Chart A: Machinery Fuel Burn Rates by Crop (Rotation Audit) */}
            <div className="chart-card" style={{ minHeight: '260px' }}>
              <h5 className="chart-title flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
                <Gauge size={14} className="text-amber" /> Machinery Fuel Burn Rate by Crop (Gal/Ac)
              </h5>
              {cropFuelData.length === 0 ? (
                <div className="empty-chart flex-center h-100">No telemetry log entries.</div>
              ) : (
                <div className="svg-chart-container" style={{ marginTop: '0.5rem' }}>
                  <svg width="100%" height={cropFuelData.length * 40 + 20} viewBox={`0 0 400 ${cropFuelData.length * 40 + 20}`}>
                    <defs>
                      <linearGradient id="fuelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="1" />
                      </linearGradient>
                    </defs>

                    {cropFuelData.map((item, idx) => {
                      const y = idx * 40 + 10;
                      const barWidth = (item.avgFuel / maxAvgFuel) * 220;
                      const isHovered = hoveredFuelBar === item.name;

                      // Hover calculations
                      const activeFleetCount = filteredRecords.filter(r => (r.cropType || 'Potatoes') === item.name && parseFloat(r.fuelRateGalAc) > 0).length;
                      const efficiencyGrade = item.avgFuel < 0.9 ? 'High Efficiency' : item.avgFuel < 1.4 ? 'Optimal Efficiency' : 'High Fuel Consumption';

                      return (
                        <g 
                          key={item.name}
                          onMouseEnter={(e) => {
                            setHoveredFuelBar(item.name);
                            setTooltip({
                              show: true,
                              x: e.clientX,
                              y: e.clientY,
                              content: (
                                <div>
                                  <strong style={{ color: 'var(--frito-gold)', display: 'block', marginBottom: '2px' }}>{item.name} Logistics</strong>
                                  <strong>Avg Fuel rate:</strong> {item.avgFuel.toFixed(2)} Gal/Ac<br/>
                                  <strong>Active Fleet Logged:</strong> {activeFleetCount} reports<br/>
                                  <strong>Performance:</strong> <span style={{ color: item.avgFuel > 1.4 ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{efficiencyGrade}</span>
                                </div>
                              )
                            });
                          }}
                          onMouseMove={(e) => {
                            setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
                          }}
                          onMouseLeave={() => {
                            setHoveredFuelBar(null);
                            setTooltip(prev => ({ ...prev, show: false }));
                          }}
                          style={{
                            cursor: 'pointer',
                            transform: isHovered ? 'scaleX(1.025)' : 'none',
                            transformOrigin: '130px center',
                            transition: 'all 0.2s ease-out'
                          }}
                        >
                          <text x="10" y={y + 14} fill={isHovered ? '#ffffff' : '#a39999'} fontSize="10" fontWeight="bold" style={{ transition: 'fill 0.2s' }}>
                            {item.name}
                          </text>
                          <rect x="130" y={y} width="220" height="18" rx="3" fill="#241717" opacity="0.3" />
                          <rect x="130" y={y} width={Math.max(barWidth, 5)} height="18" rx="3" fill="url(#fuelGradient)" style={{ transition: 'width 0.3s ease-out' }} />
                          <text x={140 + barWidth} y={y + 13} fill="#ffffff" fontSize="9" fontWeight="bold">
                            {item.avgFuel.toFixed(2)} Gal/Ac
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>

            {/* Chart B: Target vs. Applied Seeding Deviation */}
            <div className="chart-card" style={{ minHeight: '260px' }}>
              <h5 className="chart-title">Precision Planting Seeding Deviation (%)</h5>
              {seedingAccuracyData.length === 0 ? (
                <div className="empty-chart flex-center h-100 text-muted" style={{ fontSize: '0.65rem' }}>
                  No active seeding telemetry logs in selected stage. Click &apos;Seeding Phase&apos; to audit precision metrics.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 0', flex: 1, overflowY: 'auto' }}>
                  {seedingAccuracyData.map((plot, idx) => (
                    <div key={idx} style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.01)',
                      border: '1px solid var(--border-card)',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div>
                        <strong style={{ fontSize: '0.72rem', display: 'block' }}>{plot.fieldName}</strong>
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>Crop Type: {plot.crop}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className={`badge ${plot.devPercent > 8 ? 'badge-red' : 'badge-emerald'}`} style={{
                          fontSize: '0.62rem',
                          fontWeight: 'bold',
                          padding: '3px 6px',
                          borderRadius: '6px'
                        }}>
                          {plot.devPercent}% Deviation
                        </span>
                        <span style={{ fontSize: '0.52rem', display: 'block', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {plot.devPercent > 8 ? 'Attention Required' : 'Optimal Precision'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Row 4: Submissions Table */}
      <div className="table-card" style={{ marginTop: '0.5rem' }}>
        <h5 className="table-title">Recent Grower Ingestion Submissions (BigQuery Logs)</h5>
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="grower-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <th>Partner ID</th>
                <th>Grower / Farm</th>
                <th>Variety</th>
                <th>Moisture</th>
                <th>Defects</th>
                <th>Yield</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1.5px solid rgba(255,255,255,0.02)' }}>
                  <td className="font-mono text-amber font-bold">{r.id}</td>
                  <td>
                    <div className="table-cell-multi">
                      <strong>{r.growerName || 'Unknown'}</strong>
                      <span className="text-muted">{r.fieldName || 'No Farm'} ({r.region || 'No Region'})</span>
                    </div>
                  </td>
                  <td>
                    {r.cropType && r.cropType !== 'Potatoes' ? (
                      <span className="badge badge-amber" style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#ffd000' }}>
                        {r.cropType} ({r.variety || 'Standard'})
                      </span>
                    ) : (
                      r.variety || '-'
                    )}
                  </td>
                  <td>{r.moisturePercentage ? `${r.moisturePercentage}%` : '-'}</td>
                  <td>{r.defectRate ? `${r.defectRate}%` : '-'}</td>
                  <td>{r.yieldTons ? `${r.yieldTons} T` : '-'}</td>
                  <td>
                    <span className={`status-badge badge-${(r.submissionStatus || 'Pending').toLowerCase()}`}>
                      {r.submissionStatus || 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-3">No submissions received yet in BigQuery.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {tooltip.show && (
        <div style={{
          position: 'fixed',
          top: tooltip.y + 12,
          left: tooltip.x + 12,
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid var(--border-card)',
          borderRadius: '8px',
          padding: '8px 12px',
          zIndex: 10000,
          pointerEvents: 'none',
          fontFamily: 'Inter, sans-serif',
          fontSize: '0.68rem',
          color: '#ffffff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          lineHeight: '1.4'
        }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
