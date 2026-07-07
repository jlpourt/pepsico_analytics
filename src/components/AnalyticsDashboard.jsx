'use client';

import React, { useEffect, useState } from 'react';
import { Database, RefreshCw, AlertOctagon, ShieldCheck, Map, BarChart3, HelpCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

const InteractiveMap = dynamic(() => import('./InteractiveMap'), {
  ssr: false,
  loading: () => <div className="empty-chart flex-center h-100">Loading Interactive Map...</div>
});

import InteractiveGraph from './InteractiveGraph';

export default function AnalyticsDashboard({ refreshTrigger }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredField, setHoveredField] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('NA'); // Default globally filtered to NA region
  const [selectedLayer, setSelectedLayer] = useState('yield'); // 'yield', 'ndvi', 'moisture', 'temp'
  const [viewMode, setViewMode] = useState('map'); // 'map' or 'graph'

  const fetchRecords = async () => {
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
    fetchRecords();
  }, [refreshTrigger]);

  // Global Region Filter Applied Instantly to All Charts and Tables
  const filteredRecords = records.filter(r => selectedRegion === 'All' || r.region === selectedRegion);

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

  // Group yields by Potato Variety (for filtered records)
  const varietyGroup = filteredRecords.reduce((acc, curr) => {
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
        variety: r.variety
      };
    });

  // Extract Exceptions inside Agronomist Inbox (for filtered records)
  const exceptionsList = filteredRecords.filter(r => r.submissionStatus === 'Flagged');

  return (
    <div className="dashboard-container" style={{ padding: '1.25rem', gap: '1.25rem' }}>
      {/* Top Controls Header */}
      <div className="dashboard-header-bar">
        <div className="dashboard-tag">
          <Database size={14} />
          <span>BigQuery Data Warehouse Active</span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span style={{ color: '#fff', fontSize: '0.72rem', textTransform: 'uppercase' }}>Filtered: {selectedRegion} Region</span>
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
              <div className="svg-chart-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Earth Engine & BigQuery Layer Selector Pill Group */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'yield', label: 'Crop Yield (BQ)', color: '#dc2626' },
                    { id: 'ndvi', label: 'NDVI Vegetation (EE)', color: '#16a34a' },
                    { id: 'moisture', label: 'Soil Moisture (EE)', color: '#2563eb' },
                    { id: 'temp', label: 'Canopy Temp (EE)', color: '#f97316' }
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

                <InteractiveMap fields={mapFields} selectedRegion={selectedRegion} selectedLayer={selectedLayer} />
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
          <h5 className="chart-title flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
            <BarChart3 size={14} className="text-amber" /> Crop Yield by Potato Variety (Tons)
          </h5>
          {varietyData.length === 0 ? (
            <div className="empty-chart flex-center h-100">No records found.</div>
          ) : (
            <div className="svg-chart-container">
              <svg width="100%" height={varietyData.length * 40 + 20} viewBox={`0 0 400 ${varietyData.length * 40 + 20}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="fritoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#d21226" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#ffb81c" stopOpacity="1" />
                  </linearGradient>
                </defs>

                {varietyData.map((item, idx) => {
                  const y = idx * 40 + 10;
                  const barWidth = (item.yield / maxVarietyYield) * 220;
                  return (
                    <g key={item.name}>
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
          <h5 className="chart-title">Quality Control: Moisture Zone Plot</h5>
          {filteredRecords.length === 0 ? (
            <div className="empty-chart flex-center h-100">No records.</div>
          ) : (
            <div className="svg-chart-container">
              <svg width="100%" height="150" viewBox="0 0 400 150">
                <line x1="40" y1="20" x2="380" y2="20" stroke="#3d2f2f" strokeDasharray="2" />
                <line x1="40" y1="70" x2="380" y2="70" stroke="#3d2f2f" strokeDasharray="2" />
                <line x1="40" y1="120" x2="380" y2="120" stroke="#3d2f2f" strokeDasharray="2" />

                {/* Shaded Optimal Quality Zone (Moisture 12% - 18%) */}
                <rect x="40" y="53.6" width="340" height="28.8" fill="#10b981" opacity="0.08" />
                <text x="375" y="68" fill="#10b981" fontSize="9" textAnchor="end" opacity="0.5">Optimal Zone (12-18%)</text>

                {/* Axes Labels */}
                <text x="35" y="24" fill="#a39999" fontSize="8" textAnchor="end">25%</text>
                <text x="35" y="74" fill="#a39999" fontSize="8" textAnchor="end">12.5%</text>
                <text x="35" y="124" fill="#a39999" fontSize="8" textAnchor="end">0%</text>
                
                {/* Plot dots */}
                {filteredRecords.map((r, idx) => {
                  const count = filteredRecords.length;
                  const x = count > 1 ? 40 + (idx / (count - 1)) * 320 : 200;
                  const m = parseFloat(r.moisturePercentage) || 0;
                  const y = 140 - (Math.min(m, 25) / 25) * 120;
                  const isOptimal = m >= 12 && m <= 18;
                  return (
                    <g key={r.id}>
                      <circle 
                        cx={x} 
                        cy={y} 
                        r={hoveredField === r.id ? "7" : "4"} 
                        fill={isOptimal ? "#10b981" : m > 18 ? "#ffb81c" : "#ef4444"} 
                        stroke="#0a0808" 
                        strokeWidth="1"
                        style={{ cursor: 'pointer', transition: 'r 0.1s' }}
                        onMouseEnter={() => setHoveredField(r.id)}
                        onMouseLeave={() => setHoveredField(null)}
                      />
                    </g>
                  );
                })}
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
                if (m > 18 || m < 12) reasons.push(`Moisture (${m}%) outside target 12-18%`);
                if (d > 4.0) reasons.push(`Defects (${d}%) exceeds 4.0% limit`);
                if (y < 25.0) reasons.push(`Low Yield outlier (${y} Tons)`);
                
                return (
                  <div key={r.id} className="field-card" style={{ borderLeft: '3px solid var(--status-red)', padding: '0.4rem 0.6rem', marginBottom: '0.35rem' }}>
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
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Submissions Table */}
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
                  <td>{r.variety || '-'}</td>
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
    </div>
  );
}
