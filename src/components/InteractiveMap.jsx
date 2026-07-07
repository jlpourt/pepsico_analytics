'use client';

import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export default function InteractiveMap({ fields, selectedRegion, selectedLayer = 'yield', onFieldClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polygonLayerGroupRef = useRef(null);

  // Helper function to draw map layers (either circle markers or precise polygons) based on current zoom scale
  const drawMapLayers = (map, layerGroup, activeFields, layer) => {
    const L = require('leaflet');
    layerGroup.clearLayers();

    const currentZoom = map.getZoom();
    const useCircleMarkers = currentZoom < 7; // Swap to circle markers when zoomed out past level 7

    activeFields.forEach(f => {
      // Parse coordinates
      let latLons = [];
      if (f.wkt) {
        try {
          const coordsPart = f.wkt.replace('POLYGON((', '').replace('))', '');
          latLons = coordsPart.split(',').map(pair => {
            const [lonStr, latStr] = pair.trim().split(' ');
            return [parseFloat(latStr), parseFloat(lonStr)];
          });
        } catch (e) {}
      }

      // Calculate layer fill color
      let layerColor = '#cbd5e1';
      if (layer === 'yield') {
        const yieldVal = parseFloat(f.yieldTons) || 0;
        if (yieldVal < 30) layerColor = '#fca5a5';
        else if (yieldVal < 45) layerColor = '#fdc77f';
        else layerColor = '#81dbcf';
      } else if (layer === 'ndvi') {
        const ndviVal = parseFloat(f.ndvi) || 0;
        if (ndviVal < 0.45) layerColor = '#ffe7b9';
        else if (ndviVal < 0.70) layerColor = '#81dbcf';
        else layerColor = '#1f8b82';
      } else if (layer === 'moisture') {
        const smVal = parseFloat(f.soilMoisture) || 0;
        if (smVal < 20) layerColor = '#ffffd9';
        else if (smVal < 30) layerColor = '#41b6c4';
        else layerColor = '#225ea8';
      } else if (layer === 'temp') {
        const tempVal = parseFloat(f.surfaceTemp) || 0;
        if (tempVal < 24) layerColor = '#cbd5e1';
        else if (tempVal < 28) layerColor = '#f768a1';
        else layerColor = '#ae017e';
      }

      let mapElement;

      if (useCircleMarkers) {
        // Render visible circle dot marker when zoomed out
        const lat = f.centerLat || (latLons[0] ? latLons[0][0] : 0);
        const lon = f.centerLon || (latLons[0] ? latLons[0][1] : 0);
        if (lat === 0 && lon === 0) return;

        mapElement = L.circleMarker([lat, lon], {
          radius: 8, // Fixed pixel size ensures visibility at global zoom
          fillColor: layerColor,
          color: '#ffffff',
          weight: 1.5,
          fillOpacity: 0.85
        });

        mapElement.on('mouseover', () => {
          mapElement.setRadius(11);
          mapElement.setStyle({ fillOpacity: 1.0 });
        });

        mapElement.on('mouseout', () => {
          mapElement.setRadius(8);
          mapElement.setStyle({ fillOpacity: 0.85 });
        });
      } else {
        // Render precise GIS WKT polygon when zoomed in
        if (latLons.length === 0) return;
        mapElement = L.polygon(latLons, {
          color: '#ffffff',
          fillColor: layerColor,
          fillOpacity: 0.70,
          weight: 1.5
        });

        mapElement.on('mouseover', () => {
          mapElement.setStyle({ fillOpacity: 0.90, weight: 2.5, color: '#191c1d' });
        });

        mapElement.on('mouseout', () => {
          mapElement.setStyle({ fillOpacity: 0.70, weight: 1.5, color: '#ffffff' });
        });
      }

      // Bind click triggers
      mapElement.on('click', () => {
        if (onFieldClick) onFieldClick(f.id);
      });

      // Bind detailed telemetry popup
      mapElement.bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 11px; line-height: 1.4; color: #191c1d; width: 180px;">
          <strong style="font-size: 12px; display: block; margin-bottom: 4px; border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; color: #111827;">${f.fieldName}</strong>
          <strong>Grower:</strong> ${f.growerName}<br/>
          <strong>Variety:</strong> ${f.variety || '-'}<br/>
          <strong>Region:</strong> ${f.region || '-'}<br/>
          
          <div style="margin-top: 4px; border-top: 1px solid #f3f4f6; padding-top: 4px;">
            <span style="font-weight: bold; color: #4b5563; font-size: 10px; text-transform: uppercase;">BigQuery Metrics:</span><br/>
            <strong>Yield:</strong> <span style="color: ${f.color}; font-weight: bold;">${f.yieldTons} Tons</span><br/>
            <strong>Moisture:</strong> ${f.moisturePercentage}%
          </div>
          
          <div style="margin-top: 4px; border-top: 1px solid #f3f4f6; padding-top: 4px;">
            <span style="font-weight: bold; color: #4b5563; font-size: 10px; text-transform: uppercase;">Earth Engine Analytics:</span><br/>
            <strong>NDVI:</strong> <span style="color: #16a34a; font-weight: bold;">${f.ndvi}</span><br/>
            <strong>Soil Moisture:</strong> <span style="color: #2563eb; font-weight: bold;">${f.soilMoisture}%</span><br/>
            <strong>Surface Temp:</strong> ${f.surfaceTemp}°C
          </div>
        </div>
      `);

      layerGroup.addLayer(mapElement);
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const L = require('leaflet');

    if (!mapInstanceRef.current && mapRef.current) {
      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true
      }).setView([20, 0], 2);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }).addTo(map);

      mapInstanceRef.current = map;
      polygonLayerGroupRef.current = L.featureGroup().addTo(map);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        polygonLayerGroupRef.current = null;
      }
    };
  }, []);

  // Update viewport focus and redraw layers when fields, region or layers change
  useEffect(() => {
    if (!mapInstanceRef.current || !polygonLayerGroupRef.current) return;

    const L = require('leaflet');
    const map = mapInstanceRef.current;
    const layerGroup = polygonLayerGroupRef.current;

    // Draw initial layers
    drawMapLayers(map, layerGroup, fields, selectedLayer);

    // Zoom adjustments
    if (fields.length > 0) {
      try {
        if (selectedRegion === 'All') {
          map.setView([20, 0], 2);
        } else {
          // Create temporary Leaflet polygons list just to fetch overall bounds
          const tempPolygons = [];
          fields.forEach(f => {
            if (!f.wkt) return;
            const coordsPart = f.wkt.replace('POLYGON((', '').replace('))', '');
            const latLons = coordsPart.split(',').map(pair => {
              const [lonStr, latStr] = pair.trim().split(' ');
              return [parseFloat(latStr), parseFloat(lonStr)];
            });
            if (latLons.length > 0) tempPolygons.push(L.polygon(latLons));
          });

          if (tempPolygons.length > 0) {
            const bounds = L.featureGroup(tempPolygons).getBounds();
            const east = bounds.getEast();
            const west = bounds.getWest();
            const north = bounds.getNorth();
            const south = bounds.getSouth();

            if (Math.abs(east - west) > 8 || Math.abs(north - south) > 8) {
              const firstFieldCenter = tempPolygons[0].getBounds().getCenter();
              map.setView(firstFieldCenter, 10);
            } else {
              map.fitBounds(bounds, { padding: [15, 15], maxZoom: 14 });
            }
          }
        }
      } catch (err) {
        console.error("Failed to fit bounds:", err);
      }
    } else {
      map.setView([20, 0], 2);
    }
  }, [fields, selectedRegion, selectedLayer, onFieldClick]);

  // Keep event zoomend listener synced with the latest active fields and layers
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    
    // Clear old zoom listener and add fresh one to close over updated fields/layer reference
    map.off('zoomend');
    map.on('zoomend', () => {
      if (polygonLayerGroupRef.current) {
        drawMapLayers(map, polygonLayerGroupRef.current, fields, selectedLayer);
      }
    });
  }, [fields, selectedLayer, onFieldClick]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '380px' }}>
      <div 
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          borderRadius: '8px', 
          border: '1px solid var(--border-card)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
          zIndex: 1
        }} 
      />
      {/* Floating HUD Legend Bar */}
      <div style={{
        position: 'absolute',
        bottom: '8px',
        right: '8px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid var(--border-card)',
        borderRadius: '6px',
        padding: '4px 8px',
        zIndex: 10,
        pointerEvents: 'none',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        fontFamily: 'Inter, sans-serif',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
      }}>
        <span style={{ fontSize: '0.55rem', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {selectedLayer === 'ndvi' ? 'Sentinel-2 NDVI' : selectedLayer === 'moisture' ? 'SMAP Soil Moisture' : selectedLayer === 'temp' ? 'MODIS Canopy Temp' : 'BQ Final Yield'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
            {selectedLayer === 'ndvi' ? '0.30' : selectedLayer === 'moisture' ? '10%' : selectedLayer === 'temp' ? '18°C' : '20 T'}
          </span>
          <div style={{
            width: '60px',
            height: '6px',
            borderRadius: '3px',
            background: selectedLayer === 'ndvi' 
              ? 'linear-gradient(to right, #ffe7b9, #81dbcf, #1f8b82)' 
              : selectedLayer === 'moisture' 
              ? 'linear-gradient(to right, #ffffd9, #41b6c4, #225ea8)' 
              : selectedLayer === 'temp' 
              ? 'linear-gradient(to right, #cbd5e1, #f768a1, #ae017e)' 
              : 'linear-gradient(to right, #fca5a5, #fdc77f, #81dbcf)'
          }} />
          <span style={{ fontSize: '0.6rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
            {selectedLayer === 'ndvi' ? '0.90' : selectedLayer === 'moisture' ? '35%' : selectedLayer === 'temp' ? '30°C' : '50 T'}
          </span>
        </div>
      </div>
    </div>
  );
}
