'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, ArrowRight, Loader2, Sparkles, Plus, Trash2, MapPin, Database } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export default function FieldIngestionPanel({ onSubmissionSuccess }) {
  const [activeTab, setActiveTab] = useState('pdf'); // 'pdf', 'csv', 'image'
  const [file, setFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Foundation Critical');
  const [successMessage, setSuccessMessage] = useState('');
  
  // CSV Batch Ingestion state
  const [csvRecords, setCsvRecords] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  
  // Leaflet micro map refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polygonLayerRef = useRef(null);

  // Clean up states when tab swaps
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setFile(null);
    setImagePreview('');
    setExtractedData(null);
    setSuccessMessage('');
    setCsvRecords([]);
    setCsvHeaders([]);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      polygonLayerRef.current = null;
    }
  };

  // Telemetry map drawer for Tab C: Photo Coordinates
  useEffect(() => {
    if (activeTab !== 'image' || !extractedData || !extractedData.fieldLocation || typeof window === 'undefined') return;
    
    // Parse polygon WKT
    let latLons = [];
    try {
      const coordsPart = extractedData.fieldLocation.replace('POLYGON((', '').replace('))', '');
      latLons = coordsPart.split(',').map(pair => {
        const [lonStr, latStr] = pair.trim().split(' ');
        return [parseFloat(latStr), parseFloat(lonStr)];
      });
    } catch(e) {
      console.warn("Failed to parse coordinates for preview map:", e);
    }

    if (latLons.length === 0) return;

    const L = require('leaflet');
    
    // Delay initialization slightly to ensure wrapper DOM has rendered
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      
      try {
        if (!mapInstanceRef.current) {
          const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: false
          }).setView(latLons[0], 13);

          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 20
          }).addTo(map);

          mapInstanceRef.current = map;
          polygonLayerRef.current = L.featureGroup().addTo(map);
        }

        const map = mapInstanceRef.current;
        const layerGroup = polygonLayerRef.current;
        layerGroup.clearLayers();

        const polygon = L.polygon(latLons, {
          color: '#ffd000',
          fillColor: '#ba1a1a',
          fillOpacity: 0.4,
          weight: 2
        }).addTo(layerGroup);

        map.fitBounds(polygon.getBounds(), { padding: [10, 10] });
      } catch(err) {
        console.error("Leaflet initialization failed inside panel:", err);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [extractedData, activeTab]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      if (activeTab === 'image') {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result);
        };
        reader.readAsDataURL(selectedFile);
      }
    }
  };

  // Parses CSV Batch uploads
  const handleCsvUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const fileReader = new FileReader();
      fileReader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) return;

        // Extract headers
        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const parsed = lines.slice(1).map((line, lineIdx) => {
          const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
          const record = {};
          headers.forEach((header, valIdx) => {
            record[header] = values[valIdx] || '';
          });
          record.id = record.id || `SUB-CSV-${lineIdx}-${Math.floor(1000 + Math.random() * 9000)}`;
          return record;
        });

        setCsvHeaders(headers);
        setCsvRecords(parsed);
      };
      fileReader.readAsText(e.target.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setIsLoading(true);
    setExtractedData(null);
    setSuccessMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error("Document parsing failed");
      const result = await response.json();
      setExtractedData(result.data);
    } catch(err) {
      console.error(err);
      alert("Vertex AI Parsing Error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (key, value) => {
    setExtractedData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleCsvCellChange = (rowIdx, header, value) => {
    setCsvRecords(prev => {
      const updated = [...prev];
      updated[rowIdx] = { ...updated[rowIdx], [header]: value };
      return updated;
    });
  };

  const handleCsvDeleteRow = (rowIdx) => {
    setCsvRecords(prev => prev.filter((_, idx) => idx !== rowIdx));
  };

  const handleCsvAddRow = () => {
    setCsvRecords(prev => [
      ...prev,
      {
        id: `SUB-CSV-${prev.length}-${Math.floor(1000 + Math.random() * 9000)}`,
        fieldName: 'New Field',
        variety: 'Atlantic',
        growerName: '',
        region: 'NA',
        yieldTons: '0.0',
        moisturePercentage: '14.0',
        defectRate: '0.0',
        cropSeason: '2026'
      }
    ]);
    if (csvHeaders.length === 0) {
      setCsvHeaders(['id', 'fieldName', 'variety', 'growerName', 'region', 'yieldTons', 'moisturePercentage', 'defectRate', 'cropSeason']);
    }
  };

  const handleSubmitExtracted = async () => {
    if (!extractedData) return;
    setIsLoading(true);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: extractedData }),
      });

      if (!response.ok) throw new Error("Database submit failed");
      
      const result = await response.json();
      setSuccessMessage(`Document committed successfully! Added record ID: ${result.record.id}`);
      setExtractedData(null);
      setFile(null);
      setImagePreview('');
      if (onSubmissionSuccess) onSubmissionSuccess();
    } catch(err) {
      console.error(err);
      alert("Submission Error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitCsvBatch = async () => {
    if (csvRecords.length === 0) return;
    setIsLoading(true);

    let successCount = 0;
    try {
      // Post all records in sequential requests
      for (const rec of csvRecords) {
        const response = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: rec }),
        });
        if (response.ok) successCount++;
      }

      setSuccessMessage(`Successfully uploaded ${successCount} out of ${csvRecords.length} records into BigQuery!`);
      setCsvRecords([]);
      setCsvHeaders([]);
      if (onSubmissionSuccess) onSubmissionSuccess();
    } catch(err) {
      console.error(err);
      alert("Batch Submission Error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Group fields into categories (aligned with Datapoints.pdf groups)
  const categories = {
    'Foundation Critical': ['fieldName', 'variety', 'country', 'vendorName', 'growerName', 'cropSeason', 'fieldLocation'],
    'Foundation Recommended': ['region', 'vendorContact', 'cipcApplied', 'activeIngredientRate', 'irrigationType', 'moisturePercentage', 'defectRate', 'yieldTons'],
    'Advanced Insights': ['agronomistName', 'nApplied', 'nTotal', 'pTotal', 'kTotal', 'vrtUsed', 'fertilizerType', 'fertilizerNature', 'nitrogenAnalysis', 'phosphateAnalysis', 'potassiumAnalysis', 'applicationRate', 'applicationMethod', 'emissionsInhibitors', 'applicationDate']
  };

  const fieldLabels = {
    growerName: 'Grower Name',
    vendorName: 'Vendor Name',
    country: 'Country (ISO)',
    region: 'Geographic Region',
    cropSeason: 'Crop Season',
    vendorContact: 'Vendor Contact',
    fieldName: 'Field Name',
    variety: 'Potato Variety',
    fieldLocation: 'GPS Coordinates WKT',
    agronomistName: 'PepsiCo Agronomist',
    irrigationType: 'Irrigation Type',
    nApplied: 'N Applied (kg/ha)',
    nTotal: 'N Total (tons)',
    pTotal: 'P Total (tons)',
    kTotal: 'K Total (tons)',
    vrtUsed: 'Variable Rate Tech (VRT)',
    fertilizerType: 'Fertilizer Type',
    fertilizerNature: 'Fertilizer Origin',
    nitrogenAnalysis: 'Nitrogen Content %',
    phosphateAnalysis: 'Phosphate Content %',
    potassiumAnalysis: 'Potassium Content %',
    applicationRate: 'App Rate (kg/ha)',
    applicationMethod: 'Application Method',
    emissionsInhibitors: 'Emissions Inhibitor',
    applicationDate: 'Application Date',
    cipcApplied: 'Sprout Inhibitor',
    activeIngredientRate: 'Active Ing Rate',
    moisturePercentage: 'Moisture Percentage %',
    defectRate: 'Defect Rate %',
    yieldTons: 'Yield (Tons)'
  };

  // Quick Demo Seed loads
  const loadDemoPdf = async () => {
    setIsLoading(true);
    setSuccessMessage('');
    try {
      const response = await fetch('/mock_crop_log.jpg'); // Serve mock PDF coordinates
      const blob = await response.blob();
      const loadedFile = new File([blob], 'PotatoAgronomyLog_SUB-20061.pdf', { type: 'application/pdf' });
      setFile(loadedFile);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
    }
  };

  const loadDemoCsv = () => {
    setSuccessMessage('');
    const demoHeaders = ['fieldName', 'variety', 'growerName', 'region', 'yieldTons', 'moisturePercentage', 'defectRate', 'cropSeason'];
    const demoRows = [
      { id: 'SUB-CSV-1', fieldName: 'Red River Plot 1', variety: 'Frito-Lay Proprietary (FL-1867)', growerName: 'Sarah Jenkins', region: 'NA', yieldTons: '49.2', moisturePercentage: '14.1', defectRate: '1.2', cropSeason: '2026' },
      { id: 'SUB-CSV-2', fieldName: 'Hermosillo Plot 3', variety: 'Low Glycemic', growerName: 'Carlos Gomez', region: 'LATAM', yieldTons: '38.5', moisturePercentage: '13.5', defectRate: '2.4', cropSeason: '2026' },
      { id: 'SUB-CSV-3', fieldName: 'Nile Delta 2', variety: 'Atlantic', growerName: 'Amina El-Sayed', region: 'AMESA', yieldTons: '31.2', moisturePercentage: '19.8', defectRate: '5.1', cropSeason: '2026' }
    ];
    setCsvHeaders(demoHeaders);
    setCsvRecords(demoRows);
  };

  const loadDemoImage = async () => {
    setIsLoading(true);
    setSuccessMessage('');
    try {
      const response = await fetch('/mock_crop_log.jpg');
      const blob = await response.blob();
      const loadedFile = new File([blob], 'FieldReport_Snap_2026.png', { type: 'image/png' });
      setFile(loadedFile);
      setImagePreview('/mock_crop_log.jpg');
      setIsLoading(false);
    } catch(err) {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', color: 'var(--text-primary)' }}>
      
      {/* Success Notification Bar */}
      {successMessage && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          border: '1.5px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '12px',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle size={18} color="#10b981" />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: '600' }}>{successMessage}</span>
        </div>
      )}

      {/* Primary 3-Way Sub Tabs Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-card)',
        gap: '1.5rem',
        paddingBottom: '0.25rem'
      }}>
        <button
          onClick={() => handleTabChange('pdf')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'pdf' ? 'var(--frito-gold)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'pdf' ? '800' : '600',
            fontSize: '0.8rem',
            paddingBottom: '6px',
            borderBottom: activeTab === 'pdf' ? '2.5px solid var(--frito-gold)' : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          PDF Document Parsing
        </button>
        <button
          onClick={() => handleTabChange('csv')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'csv' ? 'var(--frito-gold)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'csv' ? '800' : '600',
            fontSize: '0.8rem',
            paddingBottom: '6px',
            borderBottom: activeTab === 'csv' ? '2.5px solid var(--frito-gold)' : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Spreadsheet Batch Import
        </button>
        <button
          onClick={() => handleTabChange('image')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'image' ? 'var(--frito-gold)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'image' ? '800' : '600',
            fontSize: '0.8rem',
            paddingBottom: '6px',
            borderBottom: activeTab === 'image' ? '2.5px solid var(--frito-gold)' : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Field Photo OCR
        </button>
      </div>

      {/* VIEW PANEL MAIN CONTAINER */}
      <div>
        {!extractedData && csvRecords.length === 0 ? (
          /* File Upload / Import Landing Screen */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Header info */}
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800' }}>
                {activeTab === 'pdf' ? 'Upload Grower Audit Report (PDF)' : activeTab === 'csv' ? 'Upload Bulk Field Data Points (CSV)' : 'Extract Agronomy Record from Photo'}
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {activeTab === 'pdf' 
                  ? 'Submit PDF crop sheets. Vertex AI Gemini parses agronomic tables and variables matching our compliance schema.' 
                  : activeTab === 'csv' 
                  ? 'Batch ingest dozens of submissions in a single action. Review and edit raw records before writing.' 
                  : 'Capture and upload field receipts, agronomist notes, or logs. Gemini performs structured vision extraction.'}
              </p>
            </div>

            {/* Quick Demo Loader buttons */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255, 208, 0, 0.03)',
              border: '1px solid rgba(255, 208, 0, 0.08)',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px'
            }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Demo Quick Testing:</span>
              <button
                onClick={activeTab === 'pdf' ? loadDemoPdf : activeTab === 'csv' ? loadDemoCsv : loadDemoImage}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1.5px solid var(--border-card)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.65rem',
                  fontWeight: '700',
                  padding: '3px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Sparkles size={11} color="var(--frito-gold)" /> 
                {activeTab === 'pdf' ? 'Load Sample Audit PDF' : activeTab === 'csv' ? 'Load Sample Data Sheet' : 'Load Sample Photo Receipt'}
              </button>
            </div>

            {/* Drag & Drop File Container */}
            <div style={{ position: 'relative' }}>
              <input
                type="file"
                id="panel-file-input"
                accept={activeTab === 'pdf' ? 'application/pdf' : activeTab === 'csv' ? '.csv,text/csv' : 'image/*'}
                onChange={activeTab === 'csv' ? handleCsvUpload : handleFileChange}
                style={{ display: 'none' }}
              />
              <label
                htmlFor="panel-file-input"
                className="upload-box"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem 1rem',
                  border: '2px dashed var(--border-card)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: 'rgba(255, 255, 255, 0.01)'
                }}
              >
                <Upload size={32} style={{ color: 'var(--frito-gold)', marginBottom: '0.5rem' }} />
                {file ? (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 'bold', display: 'block', color: 'var(--text-primary)' }}>{file.name}</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 'bold', display: 'block', color: 'var(--text-primary)' }}>Click to upload file</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                      {activeTab === 'pdf' ? 'Supports standard PDF documents' : activeTab === 'csv' ? 'Supports comma-separated CSV spreadsheets' : 'Supports JPG, PNG, or WEBP photos'}
                    </span>
                  </div>
                )}
              </label>
            </div>

            {/* Document Image Preview */}
            {activeTab === 'image' && imagePreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: '700', color: 'var(--text-secondary)' }}>Selected Field Slip:</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="grower slip preview"
                  style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1.5px solid var(--border-card)' }}
                />
              </div>
            )}

            {/* Ingestion Submit Button */}
            {activeTab !== 'csv' && (
              <button
                onClick={handleAnalyze}
                disabled={isLoading || !file}
                className="btn-primary"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} /> Structured parsing with Vertex AI...
                  </>
                ) : (
                  <>
                    Extract Structured Crop Metrics <ArrowRight size={16} />
                  </>
                )}
              </button>
            )}

          </div>
        ) : csvRecords.length > 0 ? (
          /* Spreadsheet Interactive Table Review Screen */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800' }}>Review Batch Data Points</h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  Validate and edit parsed records inline. Outliers are marked for checker verification.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleCsvAddRow}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1.5px solid var(--border-card)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '0.68rem',
                    fontWeight: '700',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Plus size={12} /> Add Row
                </button>
              </div>
            </div>

            {/* Batch Table Container */}
            <div style={{
              overflowX: 'auto',
              border: '1.5px solid var(--border-card)',
              borderRadius: '10px',
              backgroundColor: 'rgba(0,0,0,0.15)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.72rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-card)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>Field ID</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>Variety</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>Grower Name</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>Region</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>Yield (T)</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>Moisture %</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>Defects %</th>
                    <th style={{ padding: '8px 10px', color: 'var(--text-secondary)', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRecords.map((row, rowIdx) => {
                    const isMoistureWarning = parseFloat(row.moisturePercentage) > 18 || parseFloat(row.moisturePercentage) < 12;
                    const isYieldWarning = parseFloat(row.yieldTons) < 30;

                    return (
                      <tr key={row.id || rowIdx} style={{ borderBottom: '1px solid var(--border-card)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            value={row.fieldName || ''}
                            onChange={(e) => handleCsvCellChange(rowIdx, 'fieldName', e.target.value)}
                            style={{ width: '90px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            value={row.variety || ''}
                            onChange={(e) => handleCsvCellChange(rowIdx, 'variety', e.target.value)}
                            style={{ width: '80px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            value={row.growerName || ''}
                            onChange={(e) => handleCsvCellChange(rowIdx, 'growerName', e.target.value)}
                            style={{ width: '90px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            value={row.region || ''}
                            onChange={(e) => handleCsvCellChange(rowIdx, 'region', e.target.value)}
                            style={{ width: '50px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', backgroundColor: isYieldWarning ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                          <input
                            type="text"
                            value={row.yieldTons || ''}
                            onChange={(e) => handleCsvCellChange(rowIdx, 'yieldTons', e.target.value)}
                            style={{ width: '50px', background: 'transparent', border: 'none', color: isYieldWarning ? '#fca5a5' : 'var(--text-primary)', outline: 'none', fontWeight: 'bold' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', backgroundColor: isMoistureWarning ? 'rgba(245, 158, 11, 0.08)' : 'transparent' }}>
                          <input
                            type="text"
                            value={row.moisturePercentage || ''}
                            onChange={(e) => handleCsvCellChange(rowIdx, 'moisturePercentage', e.target.value)}
                            style={{ width: '50px', background: 'transparent', border: 'none', color: isMoistureWarning ? '#fdc77f' : 'var(--text-primary)', outline: 'none', fontWeight: 'bold' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            value={row.defectRate || ''}
                            onChange={(e) => handleCsvCellChange(rowIdx, 'defectRate', e.target.value)}
                            style={{ width: '50px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleCsvDeleteRow(rowIdx)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            <Trash2 size={13} hover="color: #ef4444" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Ingestion Submit / Cancel buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <button
                onClick={() => { setCsvRecords([]); setCsvHeaders([]); }}
                className="btn-secondary"
              >
                Clear Ingest
              </button>
              <button
                onClick={handleSubmitCsvBatch}
                disabled={isLoading}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Database size={13} />} Commit {csvRecords.length} Rows to BQ
              </button>
            </div>

          </div>
        ) : (
          /* Document Form Review Screen (Split Screen Maker-Checker view) */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
            
            {/* LEFT COLUMN: Map coordinates overlay and preview info (5 cols) */}
            <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1.5px solid var(--border-card)',
                borderRadius: '12px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ingestion Context</span>
                <div>
                  <strong style={{ fontSize: '0.8rem', display: 'block' }}>{file ? file.name : 'Crop Ingestion Log'}</strong>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Analyzed via Vertex AI Gemini Structured OCR</span>
                </div>

                {/* Micro Preview Map container */}
                {extractedData.fieldLocation ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <MapPin size={11} color="var(--frito-gold)" /> Coordinates Bound Found
                    </span>
                    <div 
                      ref={mapRef} 
                      style={{ 
                        width: '100%', 
                        height: '150px', 
                        borderRadius: '8px', 
                        border: '1.5px solid var(--border-card)',
                        zIndex: 1
                      }} 
                    />
                  </div>
                ) : (
                  <div style={{
                    border: '1.5px dashed var(--border-card)',
                    borderRadius: '8px',
                    padding: '1.5rem 0.5rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.65rem'
                  }}>
                    No GIS coordinate polygons extracted for this record.
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Maker-Checker Editable fields verification (7 cols) */}
            <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="maker-checker-screen" style={{
                backgroundColor: 'var(--bg-card)',
                border: '1.5px solid var(--border-card)',
                borderRadius: '16px',
                padding: '1rem',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '800' }}>Review extracted parameters</h4>
                  <span className="badge badge-green" style={{ textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>
                    Gemini Live Verification
                  </span>
                </div>

                {/* Category selectors */}
                <div className="category-tabs" style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-card)', paddingBottom: '3px' }}>
                  {Object.keys(categories).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: activeCategory === cat ? 'var(--frito-gold)' : 'var(--text-secondary)',
                        fontWeight: activeCategory === cat ? '800' : '600',
                        fontSize: '0.65rem',
                        padding: '4px 8px',
                        cursor: 'pointer'
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Editable Fields list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
                  {categories[activeCategory].map(key => {
                    const val = extractedData[key];
                    const isMissing = val === null || val === undefined || val === '';
                    
                    return (
                      <div key={key} className="field-card" style={{
                        border: isMissing ? '1.5px solid rgba(245, 158, 11, 0.25)' : '1.5px solid var(--border-card)',
                        backgroundColor: isMissing ? 'rgba(245, 158, 11, 0.02)' : 'rgba(255, 255, 255, 0.01)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ fontSize: '0.65rem', fontWeight: 'bold', color: isMissing ? '#fdc77f' : 'var(--text-secondary)' }}>
                            {fieldLabels[key] || key} {isMissing && '*'}
                          </label>
                          {isMissing && (
                            <span style={{ fontSize: '0.55rem', color: '#fdc77f', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold' }}>
                              <AlertTriangle size={10} /> Missing
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={val !== null && val !== undefined ? val : ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          placeholder="Manually enter value..."
                          className="field-input"
                          style={{
                            borderColor: isMissing ? 'rgba(245, 158, 11, 0.2)' : 'var(--border-card)'
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Verification Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', borderTop: '1px solid var(--border-card)', paddingTop: '0.75rem' }}>
                  <button
                    onClick={() => { setExtractedData(null); setFile(null); setImagePreview(''); }}
                    className="btn-secondary"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSubmitExtracted}
                    disabled={isLoading}
                    className="btn-primary"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={14} /> : "Submit to BigQuery"}
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
