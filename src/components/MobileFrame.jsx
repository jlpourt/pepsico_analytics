'use client';

import React, { useState, useEffect } from 'react';

export default function MobileFrame({ title, children, statusColor = '#065f46' }) {
  const [time, setTime] = useState('09:00 AM');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      setTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="phone-wrapper">
      {/* Speaker and Bezel */}
      <div className="phone-bezel">
        <div className="phone-notch">
          <div className="phone-speaker"></div>
          <div className="phone-camera"></div>
        </div>
        
        {/* Status Bar */}
        <div className="phone-status-bar" style={{ backgroundColor: statusColor }}>
          <span className="phone-time">{time}</span>
          <div className="phone-status-icons">
            {/* Signal Icon */}
            <svg className="icon-wifi" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-1.5-1.92-2.35-4.32-2.35-6.9 0-6.08 4.93-11 11-11s11 4.92 11 11c0 2.58-.85 4.98-2.35 6.9l-1.62-1.79C22.26 16.07 23 14.12 23 12c0-4.97-4.03-9-9-9z"/>
              <path d="M12 6c-3.31 0-6 2.69-6 6 0 1.48.54 2.83 1.42 3.88L8.85 17.5C7.7 16.08 7 14.28 7 12c0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.28-.7 1.6-1.85 3l1.43 1.58c.88-1.05 1.42-2.4 1.42-3.88 0-3.31-2.69-6-6-6z"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            <span className="phone-network">5G</span>
            {/* Battery Icon */}
            <div className="phone-battery">
              <div className="phone-battery-level"></div>
            </div>
          </div>
        </div>

        {/* Screen Header */}
        <div className="phone-header" style={{ borderBottomColor: statusColor + '20' }}>
          <span className="phone-header-title">{title}</span>
        </div>

        {/* Screen Body */}
        <div className="phone-screen-body">
          {children}
        </div>

        {/* Home Indicator */}
        <div className="phone-home-indicator-bar">
          <div className="phone-home-indicator"></div>
        </div>
      </div>
    </div>
  );
}
