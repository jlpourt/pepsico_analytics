'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, ArrowRight, Loader2, Sparkles, Plus, Trash2, MapPin, Keyboard, ChevronLeft, Database } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export default function AgroPartnerPortal({ onSubmissionSuccess }) {
  // Mobile app navigation state: 'home', 'pdf', 'csv', 'image', 'maker-checker', 'csv-review'
  const [viewMode, setViewMode] = useState('home');
  const [file, setFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Foundation Critical');
  const [successMessage, setSuccessMessage] = useState('');

  // CSV Ingestion States
  const [csvRecords, setCsvRecords] = useState([]);
  const [selectedCsvRowIdx, setSelectedCsvRowIdx] = useState(null); // Row index currently editing in modal

  // Leaflet map container refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polygonLayerRef = useRef(null);

  // Clear sub states on view reset
  const goHome = () => {
    setViewMode('home');
    setFile(null);
    setImagePreview('');
    setExtractedData(null);
    setSuccessMessage('');
    setCsvRecords([]);
    setSelectedCsvRowIdx(null);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      polygonLayerRef.current = null;
    }
  };

  // Map drawer for Maker-Checker coordinate validation
  useEffect(() => {
    if (viewMode !== 'maker-checker' || !extractedData || !extractedData.fieldLocation || typeof window === 'undefined') return;

    let latLons = [];
    try {
      const coordsPart = extractedData.fieldLocation.replace('POLYGON((', '').replace('))', '');
      latLons = coordsPart.split(',').map(pair => {
        const [lonStr, latStr] = pair.trim().split(' ');
        return [parseFloat(latStr), parseFloat(lonStr)];
      });
    } catch(e) {}

    if (latLons.length === 0) return;

    const L = require('leaflet');
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      try {
        if (!mapInstanceRef.current) {
          const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: false
          }).setView(latLons[0], 12);

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
          fillOpacity: 0.35,
          weight: 1.5
        }).addTo(layerGroup);

        map.fitBounds(polygon.getBounds(), { padding: [5, 5] });
      } catch(err) {
        console.error("Mobile map load error:", err);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [extractedData, viewMode]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      if (viewMode === 'image') {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result);
        };
        reader.readAsDataURL(selectedFile);
      }
    }
  };

  const handleCsvUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const fileReader = new FileReader();
      fileReader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) return;

        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const parsed = lines.slice(1).map((line, idx) => {
          const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
          const record = {};
          headers.forEach((header, valIdx) => {
            record[header] = values[valIdx] || '';
          });
          record.id = record.id || `SUB-CSV-${idx}-${Math.floor(1000 + Math.random() * 9000)}`;
          return record;
        });

        setCsvRecords(parsed);
        setViewMode('csv-review');
      };
      fileReader.readAsText(e.target.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error("Document analysis failed");
      const result = await response.json();
      setExtractedData(result.data);
      setViewMode('maker-checker');
    } catch(err) {
      alert("Extraction failed: " + err.message);
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

  const handleModalFieldChange = (key, value) => {
    setCsvRecords(prev => {
      const updated = [...prev];
      updated[selectedCsvRowIdx] = {
        ...updated[selectedCsvRowIdx],
        [key]: value
      };
      return updated;
    });
  };

  const handleCsvDeleteRow = (idx) => {
    setCsvRecords(prev => prev.filter((_, i) => i !== idx));
    if (selectedCsvRowIdx === idx) {
      setSelectedCsvRowIdx(null);
    }
  };

  const handleSubmitExtracted = async () => {
    if (!extractedData) return;
    setIsLoading(true);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: extractedData })
      });

      if (!response.ok) throw new Error("BigQuery submit failed");
      
      const result = await response.json();
      setSuccessMessage(`Ingested ID: ${result.record.id}. Quality: ${result.record.submissionStatus}`);
      setViewMode('home');
      setExtractedData(null);
      setFile(null);
      setImagePreview('');
      if (onSubmissionSuccess) onSubmissionSuccess();
    } catch(err) {
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
      for (const rec of csvRecords) {
        const response = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: rec })
        });
        if (response.ok) successCount++;
      }

      setSuccessMessage(`Ingested ${successCount} records into BigQuery dataset.`);
      setViewMode('home');
      setCsvRecords([]);
      if (onSubmissionSuccess) onSubmissionSuccess();
    } catch(err) {
      alert("Batch Error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Group fields into categories (aligned with Datapoints.pdf groups)
  const categories = {
    'Foundation Critical': ['fieldName', 'variety', 'country', 'vendorName', 'growerName', 'cropSeason', 'fieldLocation'],
    'Foundation Recommended': ['region', 'vendorContact', 'cipcApplied', 'activeIngredientRate', 'irrigationType', 'moisturePercentage', 'defectRate', 'yieldTons'],
    'Advanced Insights': ['agronomistName', 'nApplied', 'nTotal', 'pTotal', 'kTotal', 'vrtUsed', 'fertilizerType', 'fertilizerNature', 'nitrogenAnalysis', 'phosphateAnalysis', 'potassiumAnalysis', 'applicationRate', 'applicationMethod', 'emissionsInhibitors', 'applicationDate'],
    'Machinery Telemetry': ['cropType', 'equipmentModel', 'totalFuelGal', 'fuelRateGalAc', 'productivityAcHr', 'areaSeededAc', 'appliedRateSeedsAc', 'targetRateSeedsAc']
  };

  const fieldLabels = {
    growerName: 'Grower Name',
    vendorName: 'Vendor Name',
    country: 'Country (ISO)',
    region: 'Geographic Region',
    cropSeason: 'Crop Season',
    vendorContact: 'Vendor Contact',
    fieldName: 'Field Name',
    variety: 'Crop Variety / Genotype',
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
    yieldTons: 'Yield (Tons)',
    cropType: 'Crop Type',
    equipmentModel: 'Machine Model (John Deere)',
    totalFuelGal: 'Total Fuel Burned (Gallons)',
    fuelRateGalAc: 'Fuel Burn Rate (Gal/Ac)',
    productivityAcHr: 'Productivity Rate (Ac/Hr)',
    areaSeededAc: 'Area Seeded (Acres)',
    appliedRateSeedsAc: 'Applied Seeding Rate (seeds/ac)',
    targetRateSeedsAc: 'Target Seeding Rate (seeds/ac)'
  };

  // Demo loaders
  const loadDemoPdf = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/mock_crop_log.jpg');
      const blob = await response.blob();
      const loadedFile = new File([blob], 'FieldAuditReport_Sarah.pdf', { type: 'application/pdf' });
      setFile(loadedFile);
    } catch (e) {}
    setIsLoading(false);
  };

  const loadDemoCsv = () => {
    const demoRows = [
      { 
        id: 'CSV-1', 
        fieldName: 'Snake River 4A', 
        variety: 'Frito-Lay Proprietary (FL-1867)', 
        growerName: 'David Smith', 
        region: 'NA', 
        yieldTons: '44.8', 
        moisturePercentage: '14.2', 
        defectRate: '1.5', 
        cropSeason: '2026', 
        country: 'USA', 
        vendorName: 'Idaho Spud Farms', 
        fieldLocation: 'POLYGON((-84.0323 44.0493, -84.0123 44.0493, -84.0123 44.0693, -84.0323 44.0693, -84.0323 44.0493))',
        irrigationType: 'Center Pivot',
        vrtUsed: 'Yes',
        agronomistName: 'David Vance',
        fertilizerType: 'Urea',
        fertilizerNature: 'Mineral',
        nApplied: '150.5',
        applicationMethod: 'Broadcast',
        applicationDate: '2026-04-05'
      },
      { 
        id: 'CSV-2', 
        fieldName: 'Michoacan West', 
        variety: 'Low Glycemic', 
        growerName: 'Carlos Gomez', 
        region: 'LATAM', 
        yieldTons: '39.1', 
        moisturePercentage: '13.1', 
        defectRate: '2.8', 
        cropSeason: '2026', 
        country: 'MEX', 
        vendorName: 'Gomez Farms SA', 
        fieldLocation: 'POLYGON((-100.9455 20.9204, -100.9255 20.9204, -100.9255 20.9404, -100.9455 20.9404, -100.9455 20.9204))',
        irrigationType: 'Drip',
        vrtUsed: 'Yes',
        agronomistName: 'Sophia Martinez',
        fertilizerType: 'NPK 15-15-15',
        fertilizerNature: 'Mineral',
        nApplied: '210.0',
        applicationMethod: 'Drip',
        applicationDate: '2026-03-20'
      },
      { 
        id: 'CSV-3', 
        fieldName: 'Punjab Field 1', 
        variety: 'Atlantic', 
        growerName: 'Vikram Singh', 
        region: 'AMESA', 
        yieldTons: '28.5', 
        moisturePercentage: '20.5', 
        defectRate: '6.2', 
        cropSeason: '2026', 
        country: 'IND', 
        vendorName: 'Punjab Agri Corp', 
        fieldLocation: 'POLYGON((77.0807 22.0256, 77.1007 22.0256, 77.1007 22.0456, 77.0807 22.0456, 77.0807 22.0256))',
        irrigationType: 'Flood',
        vrtUsed: 'No',
        agronomistName: 'Jane Smith',
        fertilizerType: 'Compost',
        fertilizerNature: 'Organic',
        nApplied: '85.2',
        applicationMethod: 'Incorporate in-furrow',
        applicationDate: '2026-02-15'
      }
    ];
    setCsvRecords(demoRows);
    setViewMode('csv-review');
  };

  const loadDemoImage = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/mock_crop_log.jpg');
      const blob = await response.blob();
      const loadedFile = new File([blob], 'GrowerAudit_Sarah.jpg', { type: 'image/jpeg' });
      setFile(loadedFile);
      setImagePreview('/mock_crop_log.jpg');
    } catch (e) {}
    setIsLoading(false);
  };

  return (
    <div className="portal-container" style={{ color: 'var(--text-primary)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Phone Notification Toast Banner */}
      {successMessage && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          border: '1.5px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '10px',
          padding: '8px 10px',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.68rem',
          fontWeight: 'bold'
        }}>
          <CheckCircle size={14} color="#10b981" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* -------------------- VIEW 1: MOBILE HOME SCREEN -------------------- */}
      {viewMode === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1, overflowY: 'auto' }}>
          
          {/* Header Info */}
          <div>
            <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              Alpha Field Portal
            </span>
            <h3 style={{ fontSize: '0.9rem', fontWeight: '800', margin: '2px 0' }}>Agronomist Workspace</h3>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.3' }}>
              Select ingestion scanner or quick telemetry inputs. Submitted logs sync directly to BigQuery.
            </p>
          </div>

          {/* New Submissions Ingestion section */}
          <div>
            <span style={{ fontSize: '0.55rem', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px', letterSpacing: '0.5px' }}>
              New Ingestion Intake
            </span>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              
              {/* Tile A: PDF Report Scanner */}
              <div 
                onClick={() => setViewMode('pdf')}
                className="field-card" 
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px' }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(186,26,26,0.1)', display: 'flex', alignItems: 'center', justify: 'center', justifyContent: 'center' }}>
                  <FileText size={16} color="var(--frito-red)" />
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.72rem', display: 'block' }}>PDF Report Scanner</strong>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>Extract agronomy audits using Gemini</span>
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>

              {/* Tile B: CSV Bulk Importer */}
              <div 
                onClick={() => setViewMode('csv')}
                className="field-card" 
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px' }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(255,208,0,0.1)', display: 'flex', alignItems: 'center', justify: 'center', justifyContent: 'center' }}>
                  <Sparkles size={16} color="var(--frito-gold)" />
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.72rem', display: 'block' }}>Spreadsheet Batch Import</strong>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>Validate CSV lists in glass table cards</span>
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>

              {/* Tile C: Field Photo OCR */}
              <div 
                onClick={() => setViewMode('image')}
                className="field-card" 
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px' }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justify: 'center', justifyContent: 'center' }}>
                  <Upload size={16} color="var(--text-primary)" />
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.72rem', display: 'block' }}>Field Photo OCR Scanner</strong>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>Parse handwritten logs or delivery receipts</span>
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>

            </div>
          </div>

          {/* Quick Actions Grid */}
          <div style={{ marginTop: 'auto' }}>
            <span style={{ fontSize: '0.55rem', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px', letterSpacing: '0.5px' }}>
              Quick Logger Actions
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <div className="field-card" style={{ padding: '8px 4px', textAlign: 'center', fontSize: '0.58rem', cursor: 'not-allowed', opacity: 0.5 }}>
                <MapPin size={14} style={{ margin: '0 auto 4px auto' }} /> GPS Location
              </div>
              <div className="field-card" style={{ padding: '8px 4px', textAlign: 'center', fontSize: '0.58rem', cursor: 'not-allowed', opacity: 0.5 }}>
                <Sparkles size={14} style={{ margin: '0 auto 4px auto' }} /> Soil pH Log
              </div>
              <div className="field-card" style={{ padding: '8px 4px', textAlign: 'center', fontSize: '0.58rem', cursor: 'not-allowed', opacity: 0.5 }}>
                <AlertTriangle size={14} style={{ margin: '0 auto 4px auto' }} /> Pest Audit
              </div>
            </div>
          </div>

        </div>
      )}

      {/* -------------------- VIEW 2: PDF / PHOTO FILE LOADER SCREEN -------------------- */}
      {(viewMode === 'pdf' || viewMode === 'image') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={goHome} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={16} />
            </button>
            <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: '800' }}>
              {viewMode === 'pdf' ? 'PDF Audit Scanner' : 'Field Photo OCR'}
            </h4>
          </div>

          <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
            {viewMode === 'pdf' 
              ? 'Upload grower delivery sheets. Gemini will automatically map variables to compliance schemas.'
              : 'Snapshot agricultural log cards. Gemini structured output translates handwritten metrics.'}
          </p>

          {/* Quick Demo Loader */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(255, 208, 0, 0.02)',
            border: '1px solid rgba(255, 208, 0, 0.08)',
            padding: '6px 8px',
            borderRadius: '6px',
            fontSize: '0.6rem'
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Demo Seed:</span>
            <button 
              onClick={viewMode === 'pdf' ? loadDemoPdf : loadDemoImage}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-card)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '0.58rem',
                fontWeight: 'bold',
                padding: '2px 6px',
                cursor: 'pointer'
              }}
            >
              Load Demo File
            </button>
          </div>

          {/* Drag and Drop */}
          <input
            type="file"
            id="mobile-file-input"
            accept={viewMode === 'pdf' ? 'application/pdf' : 'image/*'}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <label htmlFor="mobile-file-input" className="upload-box" style={{ flex: 1, minHeight: '130px' }}>
            <Upload size={24} style={{ color: 'var(--frito-gold)', marginBottom: '4px' }} />
            {file ? (
              <div style={{ textAlign: 'center', padding: '0 8px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 'bold', display: 'block', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                  {file.name}
                </span>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 'bold', display: 'block', color: 'var(--text-primary)' }}>Select document file</span>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                  {viewMode === 'pdf' ? 'PDF Audit slips' : 'JPEG or PNG snapshots'}
                </span>
              </div>
            )}
          </label>

          {/* Image preview overlay */}
          {viewMode === 'image' && imagePreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Snapshot Preview:</span>
              <img src={imagePreview} alt="crop snap" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-card)' }} />
            </div>
          )}

          {/* Ingest button */}
          <button
            onClick={handleAnalyze}
            disabled={isLoading || !file}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={12} /> Parsing with Gemini...
              </>
            ) : (
              <>
                Analyze Document <ArrowRight size={12} />
              </>
            )}
          </button>
        </div>
      )}

      {/* -------------------- VIEW 3: CSV FILE IMPORT SCREEN -------------------- */}
      {viewMode === 'csv' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={goHome} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={16} />
            </button>
            <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: '800' }}>CSV Ingestion Hub</h4>
          </div>

          <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
            Import a list of records at once. Edit rows individually before committing.
          </p>

          {/* Quick Demo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(255, 208, 0, 0.02)',
            border: '1px solid rgba(255, 208, 0, 0.08)',
            padding: '6px 8px',
            borderRadius: '6px',
            fontSize: '0.6rem'
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Demo Seed:</span>
            <button 
              onClick={loadDemoCsv}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-card)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '0.58rem',
                fontWeight: 'bold',
                padding: '2px 6px',
                cursor: 'pointer'
              }}
            >
              Load Demo CSV
            </button>
          </div>

          <input
            type="file"
            id="mobile-csv-input"
            accept=".csv,text/csv"
            onChange={handleCsvUpload}
            style={{ display: 'none' }}
          />
          <label htmlFor="mobile-csv-input" className="upload-box" style={{ flex: 1, minHeight: '150px' }}>
            <FileText size={32} style={{ color: 'var(--frito-gold)', marginBottom: '6px' }} />
            <span style={{ fontSize: '0.68rem', fontWeight: 'bold', display: 'block', color: 'var(--text-primary)' }}>Select spreadsheet file</span>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>Supports Comma-Separated CSV formats</span>
          </label>
        </div>
      )}

      {/* -------------------- VIEW 4: BATCH CSV REVIEW SCREEN -------------------- */}
      {viewMode === 'csv-review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: '800' }}>Verify Batch ({csvRecords.length} records)</h4>
            <button onClick={goHome} className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.55rem' }}>Cancel</button>
          </div>

          {/* Scrollable list of cards on mobile screen */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
            {csvRecords.map((row, idx) => {
              const moisture = parseFloat(row.moisturePercentage) || 0;
              const isWarning = moisture > 18 || moisture < 12;
              
              return (
                <div 
                  key={row.id || idx}
                  className="field-card"
                  style={{
                    padding: '8px 10px',
                    borderColor: isWarning ? 'rgba(245, 158, 11, 0.25)' : 'var(--border-card)',
                    backgroundColor: isWarning ? 'rgba(245, 158, 11, 0.02)' : 'rgba(255, 255, 255, 0.01)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span 
                      onClick={() => { setSelectedCsvRowIdx(idx); }}
                      style={{ fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer', color: 'var(--frito-gold)', textDecoration: 'underline' }}
                    >
                      {row.fieldName || `Field-${idx}`}
                    </span>
                    <button 
                      onClick={() => handleCsvDeleteRow(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                    <span>Grower: {row.growerName || 'Unknown'} ({row.region})</span>
                    <span style={{ color: isWarning ? '#fdc77f' : 'var(--text-primary)', fontWeight: 'bold' }}>
                      M: {row.moisturePercentage}% {isWarning && '*'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating actions */}
          <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <button 
              onClick={() => {
                setCsvRecords(prev => [
                  ...prev,
                  { id: `NEW-${prev.length}`, fieldName: 'New Plot A', variety: 'Atlantic', growerName: '', region: 'NA', yieldTons: '0.0', moisturePercentage: '14.5', defectRate: '0.0', cropSeason: '2026' }
                ]);
              }}
              className="btn-secondary" 
              style={{ padding: '4px 8px', fontSize: '0.62rem' }}
            >
              + Add Record
            </button>
            <button
              onClick={handleSubmitCsvBatch}
              disabled={isLoading || csvRecords.length === 0}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 10px', fontSize: '0.62rem' }}
            >
              {isLoading ? <Loader2 className="animate-spin" size={11} /> : <Database size={11} />} Commit Ingest
            </button>
          </div>

          {/* Inline Edit popup Modal overlay if a CSV card is clicked */}
          {selectedCsvRowIdx !== null && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(3, 7, 18, 0.95)',
              zIndex: 200,
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '24px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '0.75rem' }}>Edit Batch Row Parameters</strong>
                <button onClick={() => setSelectedCsvRowIdx(null)} className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.55rem' }}>Done</button>
              </div>

              {/* Scrollable form inside overlay modal */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['fieldName', 'variety', 'growerName', 'region', 'yieldTons', 'moisturePercentage', 'defectRate', 'cropSeason'].map(key => (
                  <div key={key} className="field-card" style={{ padding: '6px 8px', marginBottom: 0 }}>
                    <label style={{ fontSize: '0.58rem', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                      {fieldLabels[key] || key}
                    </label>
                    <input
                      type="text"
                      value={csvRecords[selectedCsvRowIdx][key] || ''}
                      onChange={(e) => handleModalFieldChange(key, e.target.value)}
                      className="field-input"
                      style={{ padding: '4px 6px', fontSize: '0.68rem' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* -------------------- VIEW 5: MAKER-CHECKER REVIEW SHEET -------------------- */}
      {viewMode === 'maker-checker' && extractedData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: '800' }}>Verification Form</h4>
            <button onClick={goHome} className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.55rem' }}>Cancel</button>
          </div>

          {/* Form category select tabs */}
          <div className="category-tabs" style={{ display: 'flex', gap: '4px', marginBottom: '2px', borderBottom: '1px solid var(--border-card)', paddingBottom: '3px' }}>
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
                  fontSize: '0.58rem',
                  padding: '3px 4px',
                  cursor: 'pointer'
                }}
              >
                {cat.split(' ')[1] || cat}
              </button>
            ))}
          </div>

          {/* Scrollable list of fields */}
          <div className="scrollable-fields" style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
            {categories[activeCategory].map(key => {
              let val = extractedData[key];
              const isMissing = val === null || val === undefined || val === '';
              
              // Apply smart rules
              const isRotation = extractedData.cropType && extractedData.cropType !== 'Potatoes';
              let isDisabled = false;
              let warningMsg = '';

              if (isRotation) {
                if (key === 'cipcApplied') {
                  val = 'None';
                  isDisabled = true;
                  warningMsg = 'Disabled for rotation crops';
                }
                if (key === 'activeIngredientRate') {
                  val = '0';
                  isDisabled = true;
                  warningMsg = 'Disabled for rotation crops';
                }
              }

              if (key === 'fuelRateGalAc' && parseFloat(val) > 1.5) {
                warningMsg = '⚠ High Fuel Burn (>1.5 gal/ac)';
              }
              
              return (
                <div 
                  key={key} 
                  className="field-card"
                  style={{
                    padding: '6px 8px',
                    marginBottom: 0,
                    border: isMissing ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-card)',
                    backgroundColor: isMissing ? 'rgba(245, 158, 11, 0.02)' : 'rgba(255, 255, 255, 0.01)',
                    opacity: isDisabled ? 0.6 : 1
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <label style={{ fontSize: '0.58rem', color: isMissing ? '#fdc77f' : 'var(--text-secondary)' }}>
                      {fieldLabels[key] || key} {isMissing && '*'}
                    </label>
                    {warningMsg && (
                      <span style={{ fontSize: '0.52rem', color: '#fdc77f', fontWeight: 'bold' }}>
                        {warningMsg}
                      </span>
                    )}
                    {isMissing && !warningMsg && (
                      <span style={{ fontSize: '0.5rem', color: '#fdc77f', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold' }}>
                        <AlertTriangle size={8} /> Missing
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={val !== null && val !== undefined ? val : ''}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder={isDisabled ? 'Not applicable' : 'Empty field'}
                    className="field-input"
                    disabled={isDisabled}
                    style={{ 
                      padding: '4px 6px', 
                      fontSize: '0.68rem',
                      cursor: isDisabled ? 'not-allowed' : 'text'
                    }}
                  />
                </div>
              );
            })}

            {/* Micro Coordinate Preview Map inside scroll container */}
            {activeCategory === 'Foundation Critical' && extractedData.fieldLocation && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <MapPin size={10} color="var(--frito-gold)" /> Coordinates Bounds Preview:
                </span>
                <div 
                  ref={mapRef} 
                  style={{ 
                    width: '100%', 
                    height: '110px', 
                    borderRadius: '6px', 
                    border: '1px solid var(--border-card)',
                    zIndex: 1
                  }} 
                />
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-card)', paddingTop: '6px' }}>
            <button 
              onClick={() => { setExtractedData(null); setFile(null); setImagePreview(''); setViewMode('home'); }} 
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.62rem' }}
            >
              Discard
            </button>
            <button
              onClick={handleSubmitExtracted}
              disabled={isLoading}
              className="btn-primary"
              style={{ padding: '4px 10px', fontSize: '0.62rem' }}
            >
              {isLoading ? <Loader2 className="animate-spin" size={11} /> : "Submit Log"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
