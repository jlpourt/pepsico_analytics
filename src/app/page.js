'use client';

import React, { useState } from 'react';
import MobileFrame from '../components/MobileFrame';
import AgroPartnerPortal from '../components/AgroPartnerPortal';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import AnalyticsChat from '../components/AnalyticsChat';
import { BarChart3, Bot, LayoutDashboard, UploadCloud, Settings, Bell, Search, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard', 'chat', or 'ingestion'
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleSubmissionSuccess = () => {
    // Force Dashboard to refresh database records
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)', transition: 'background-color 0.3s ease' }}>
      
      {/* 1. Left Sidebar Navigation (Unified Dark Glassmorphic Sidebar) */}
      <aside style={{
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        width: '18rem', // Width: 288px (Stitch w-72)
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-card)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        padding: '1.5rem',
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15)',
        transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        {/* Brandmark Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
          <div style={{
            width: '2.25rem',
            height: '2.25rem',
            borderRadius: '50%',
            backgroundColor: 'var(--frito-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            boxShadow: '0 0 10px rgba(186, 26, 26, 0.4)'
          }}>
            FL
          </div>
          <span style={{ fontSize: '1.1rem', fontWeight: '800', tracking: '-0.02em', color: 'var(--text-primary)' }}>
            Field-to-Fleet
          </span>
        </div>

        {/* Navigation items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            fontWeight: '600',
            textAlign: 'left',
            cursor: 'not-allowed',
            opacity: 0.4
          }} disabled>
            <LayoutDashboard size={18} /> Fleet Overview
          </button>
          
          <button
            onClick={() => setActiveView('dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: activeView === 'dashboard' ? 'rgba(186, 26, 26, 0.1)' : 'transparent',
              color: activeView === 'dashboard' ? '#ff897a' : 'var(--text-secondary)',
              fontSize: '0.85rem',
              fontWeight: activeView === 'dashboard' ? '700' : '600',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              borderRight: activeView === 'dashboard' ? '4px solid var(--frito-red)' : 'none'
            }}
          >
            <BarChart3 size={18} /> Agronomy Analytics
          </button>
          
          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            fontWeight: '600',
            textAlign: 'left',
            cursor: 'not-allowed',
            opacity: 0.4,
            width: '100%'
          }} disabled>
            <UploadCloud size={18} /> Field Ingestion
          </button>

          <div style={{ marginTop: 'auto' }}>
            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: '600',
              width: '100%',
              textAlign: 'left',
              cursor: 'not-allowed',
              opacity: 0.4
            }} disabled>
              <Settings size={18} /> Settings
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Container shifted right by sidebar width */}
      <div style={{ 
        marginLeft: isSidebarOpen ? '18rem' : '0', 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        
        {/* 2. Top Header Navbar (Translucent Dark Frosted Navbar) */}
        <header style={{
          position: 'fixed',
          top: 0,
          left: isSidebarOpen ? '18rem' : '0',
          right: 0,
          height: '4rem', // 64px
          backgroundColor: 'rgba(3, 7, 18, 0.8)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 2rem',
          zIndex: 40,
          boxShadow: '0 1px 12px rgba(0, 0, 0, 0.2)',
          transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-card)',
                transition: 'all 0.2s'
              }}
            >
              {isSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-secondary)' }}>
              Operations Hub
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1rem', paddingRight: '1.5rem', borderRight: '1px solid var(--border-card)', color: 'var(--text-secondary)' }}>
              <Bell size={18} style={{ cursor: 'pointer' }} />
              <Search size={18} style={{ cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)' }}>Agronomist Alpha</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Senior Lead</div>
              </div>
              <div style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                backgroundColor: 'var(--frito-red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 0 8px rgba(186,26,26,0.3)'
              }}>
                <User size={14} />
              </div>
            </div>
          </div>
        </header>

        {/* 3. Main Workspace Grid */}
        <main style={{ marginTop: '4rem', padding: '2rem', flex: 1 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: '2rem',
            alignItems: 'start'
          }}>
            
            {/* LEFT COLUMN: Operations Portal (Dashboard / Chat View) */}
            <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.8px' }}>
                  Frito-Lay Operations Portal
                </span>
              </div>
              
              {/* Tab Selector Card Wrapper */}
              <div style={{
                backgroundColor: 'var(--bg-card)',
                border: '1.5px solid var(--border-card)',
                backdropFilter: 'blur(16px)',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
              }}>
                {/* Header Selector Tabs */}
                <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Agronomy Hub</h3>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Real-time telemetry and grower ingestion audit panels.</p>
                  </div>
                  
                  {/* Dashboard / Chat View toggles */}
                  <div style={{ display: 'flex', backgroundColor: 'var(--bg-secondary)', padding: '3px', borderRadius: '8px', border: '1.5px solid var(--border-card)' }}>
                    <button
                      onClick={() => setActiveView('dashboard')}
                      style={{
                        backgroundColor: activeView === 'dashboard' ? 'var(--frito-red)' : 'transparent',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 12px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Dashboard
                    </button>
                    <button
                      onClick={() => setActiveView('chat')}
                      style={{
                        backgroundColor: activeView === 'chat' ? 'var(--frito-red)' : 'transparent',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 12px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      AI Analyst
                    </button>
                  </div>
                </div>

                {/* Main Content Render */}
                <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '1rem' }}>
                  {activeView === 'dashboard' ? (
                    <AnalyticsDashboard refreshTrigger={refreshTrigger} />
                  ) : (
                    <AnalyticsChat />
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Mobile Device App Simulator Bezel */}
            <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'center', paddingLeft: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.8px' }}>
                  Agronomist Field App
                </span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <MobileFrame title="Grower App" statusColor="transparent">
                  <AgroPartnerPortal onSubmissionSuccess={handleSubmissionSuccess} />
                </MobileFrame>
              </div>
            </div>

          </div>
        </main>
      </div>

    </div>
  );
}
