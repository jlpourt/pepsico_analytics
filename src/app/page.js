'use client';

import React, { useState } from 'react';
import MobileFrame from '../components/MobileFrame';
import AgroPartnerPortal from '../components/AgroPartnerPortal';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import { BarChart3, Bot, LayoutDashboard, UploadCloud, Settings, Bell, Search, User, PanelLeftClose, PanelLeftOpen, Smartphone, PanelRightClose, PanelRightOpen, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard', 'chat', or 'ingestion'
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isPhoneOpen, setIsPhoneOpen] = useState(false); // Default phone is hidden

  const handleSubmissionSuccess = () => {
    // Force Dashboard to refresh database records
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)', transition: 'background-color 0.3s ease' }}>
      
      {/* Floating Right Toggle Tab when phone is hidden */}
      {!isPhoneOpen && (
        <button
          className="floating-phone-toggle"
          onClick={() => setIsPhoneOpen(true)}
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 50,
            backgroundColor: '#002F6C',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRight: 'none',
            borderTopLeftRadius: '12px',
            borderBottomLeftRadius: '12px',
            padding: '0.85rem 0.6rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.4)',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          title="Expand Grower Field App"
        >
          <ChevronLeft size={18} style={{ color: 'var(--frito-gold)' }} />
          <Smartphone size={18} />
          <span style={{
            writingMode: 'vertical-rl',
            textTransform: 'uppercase',
            fontSize: '0.65rem',
            fontWeight: '800',
            letterSpacing: '1.5px',
            color: 'var(--text-primary)',
            margin: '4px 0'
          }}>
            Grower App
          </span>
        </button>
      )}

      {/* Main Container */}
      <div style={{ 
        marginLeft: '0', 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
      }}>
        
        {/* 2. Top Header Navbar (Translucent Dark Frosted Navbar) */}
        <header style={{
          position: 'fixed',
          top: 0,
          left: 0,
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
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* PepsiCo Globe SVG Logo */}
            <svg viewBox="0 0 100 100" width="30" height="30" style={{ marginRight: '2px', filter: 'drop-shadow(0 2px 6px rgba(0, 47, 108, 0.5))' }}>
              <circle cx="50" cy="50" r="48" fill="#002F6C" />
              <path d="M 4 50 C 20 15, 80 15, 96 50 C 80 60, 20 60, 4 50" fill="#FFFFFF" />
              <path d="M 4 50 C 20 60, 80 60, 96 50 C 90 78, 72 96, 50 96 C 28 96, 10 78, 4 50" fill="#E31937" />
            </svg>
            <span style={{ fontSize: '1.05rem', fontWeight: '800', tracking: '-0.02em', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              AgriFlow <span style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-card)' }}>Operations Hub</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {/* Phone Toggle Button in Navbar */}
            <button
              onClick={() => setIsPhoneOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: isPhoneOpen ? 'rgba(0, 47, 108, 0.4)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isPhoneOpen ? 'var(--frito-gold)' : 'var(--border-card)'}`,
                color: isPhoneOpen ? 'var(--frito-gold)' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title={isPhoneOpen ? "Collapse Field App Simulator" : "Expand Field App Simulator"}
            >
              <Smartphone size={16} />
              <span>Grower Field App</span>
              {isPhoneOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>

            <div style={{ display: 'flex', gap: '1rem', paddingRight: '1.25rem', borderRight: '1px solid var(--border-card)', color: 'var(--text-secondary)' }}>
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
        <main style={{ marginTop: '4rem', padding: '2rem', flex: 1, position: 'relative' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isPhoneOpen ? 'repeat(12, 1fr)' : '1fr',
            gap: isPhoneOpen ? '2rem' : '0',
            alignItems: 'start',
            transition: 'all 0.3s ease-in-out'
          }}>
            
            {/* LEFT COLUMN: Operations Portal (Dashboard / Chat View) */}
            <div style={{ 
              gridColumn: isPhoneOpen ? 'span 7' : 'span 12', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1rem',
              transition: 'all 0.3s ease-in-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.8px' }}>
                  Frito-Lay Operations Portal
                </span>
                {!isPhoneOpen && (
                  <button
                    onClick={() => setIsPhoneOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--border-card)',
                      color: 'var(--text-secondary)',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Smartphone size={14} style={{ color: 'var(--frito-gold)' }} />
                    <span>Show Grower App</span>
                    <ChevronLeft size={14} />
                  </button>
                )}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Agronomy Hub</h3>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Real-time telemetry and grower ingestion audit panels.</p>
                  </div>
                </div>

                {/* Main Content Render */}
                <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '1rem' }}>
                  <AnalyticsDashboard refreshTrigger={refreshTrigger} />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Mobile Device App Simulator Bezel */}
            {isPhoneOpen && (
              <div className="phone-collapse-panel" style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Smartphone size={14} style={{ color: 'var(--frito-gold)' }} />
                    Agronomist Field App
                  </span>
                  <button
                    onClick={() => setIsPhoneOpen(false)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-card)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.72rem',
                      fontWeight: '600',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '6px',
                      transition: 'all 0.2s ease'
                    }}
                    title="Collapse Phone to Right"
                  >
                    <span>Collapse</span>
                    <PanelRightClose size={14} />
                  </button>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <MobileFrame title="Grower App" statusColor="transparent">
                    <AgroPartnerPortal onSubmissionSuccess={handleSubmissionSuccess} />
                  </MobileFrame>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

    </div>
  );
}
