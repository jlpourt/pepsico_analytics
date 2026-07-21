'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Play, Pause, RefreshCw, Sparkles, Radio, Cpu, Layers, FileText, Check, ShieldCheck } from 'lucide-react';

export default function ExecutiveAudioBriefing({ refreshTrigger, selectedRegion = 'NA' }) {
  const [activeTopic, setActiveTopic] = useState('ops'); // 'ops', 'variety', or 'sustainability'
  const [briefingData, setBriefingData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState(42);
  const [currentTime, setCurrentTime] = useState(0);

  const synthRef = useRef(null);
  const utteranceRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const timerRef = useRef(null);

  // Fetch Briefing Script from API
  const fetchBriefing = async (topicToFetch) => {
    setIsLoading(true);
    stopAudio();
    try {
      const response = await fetch('/api/audio-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicToFetch, region: selectedRegion })
      });
      if (response.ok) {
        const data = await response.json();
        setBriefingData(data);
        const sentenceCount = data.script.split('.').filter(Boolean).length;
        setDuration(Math.max(30, sentenceCount * 7));
      }
    } catch (err) {
      console.error("Failed to fetch audio briefing:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefing(activeTopic);
    return () => {
      stopAudio();
    };
  }, [activeTopic, refreshTrigger, selectedRegion]);

  const stopAudio = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setCurrentSentenceIndex(-1);
    setCurrentTime(0);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handlePlayPause = () => {
    if (!briefingData || !briefingData.script) return;

    if (isPlaying) {
      stopAudio();
    } else {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        alert("Web Speech synthesis is not supported in this browser.");
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(briefingData.script);
      utterance.rate = playbackRate;
      utterance.pitch = 1.0;

      // Select natural English voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Samantha') || v.name.includes('Daniel'))) || voices.find(v => v.lang.startsWith('en'));
      if (preferredVoice) utterance.voice = preferredVoice;

      const sentences = briefingData.script.split(/(?<=[.!?])\s+/).filter(Boolean);

      utterance.onstart = () => {
        setIsPlaying(true);
        setCurrentTime(0);
        
        // Progress timer
        timerRef.current = setInterval(() => {
          setCurrentTime(prev => {
            if (prev >= duration) {
              clearInterval(timerRef.current);
              return duration;
            }
            return prev + 1;
          });
        }, 1000 / playbackRate);
      };

      utterance.onboundary = (event) => {
        if (event.name === 'sentence' || event.name === 'word') {
          const charIdx = event.charIndex;
          let runningLength = 0;
          for (let i = 0; i < sentences.length; i++) {
            runningLength += sentences[i].length + 1;
            if (charIdx <= runningLength) {
              setCurrentSentenceIndex(i);
              break;
            }
          }
        }
      };

      utterance.onend = () => {
        setIsPlaying(false);
        setCurrentSentenceIndex(-1);
        setCurrentTime(duration);
        if (timerRef.current) clearInterval(timerRef.current);
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setCurrentSentenceIndex(-1);
        if (timerRef.current) clearInterval(timerRef.current);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  };

  // Draw Audio Waveform Spectrum
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = 4;
      const gap = 3;
      const numBars = Math.floor(width / (barWidth + gap));

      for (let i = 0; i < numBars; i++) {
        let barHeight = 6;
        if (isPlaying) {
          barHeight = Math.sin(phase + i * 0.3) * 16 + Math.cos(phase * 1.5 + i * 0.2) * 12 + 20;
          barHeight = Math.max(4, Math.min(height - 4, barHeight));
        }

        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isPlaying) {
          gradient.addColorStop(0, '#ffd000');
          gradient.addColorStop(1, '#002F6C');
        } else {
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      if (isPlaying) {
        phase += 0.15;
      }
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying]);

  const copyTranscript = () => {
    if (briefingData && briefingData.script) {
      navigator.clipboard.writeText(briefingData.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sentences = briefingData?.script ? briefingData.script.split(/(?<=[.!?])\s+/).filter(Boolean) : [];

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      backgroundColor: 'rgba(5, 10, 20, 0.75)',
      border: '1.5px solid rgba(255, 208, 0, 0.25)',
      borderRadius: '16px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      boxShadow: '0 8px 32px rgba(0, 47, 108, 0.25)',
      marginBottom: '1rem',
      backdropFilter: 'blur(16px)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background Accent Glow */}
      <div style={{
        position: 'absolute',
        top: '-40px',
        right: '-40px',
        width: '180px',
        height: '180px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,47,108,0.4) 0%, rgba(0,0,0,0) 70%)',
        pointerEvents: 'none'
      }} />

      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: '2.2rem',
            height: '2.2rem',
            borderRadius: '10px',
            backgroundColor: 'rgba(0, 47, 108, 0.5)',
            border: '1px solid var(--frito-gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--frito-gold)',
            boxShadow: '0 0 12px rgba(255, 208, 0, 0.2)'
          }}>
            <Radio size={18} className={isPlaying ? "animate-spin" : ""} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                Executive Audio Briefing Co-Pilot
              </h3>
              <span style={{
                fontSize: '0.62rem',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: 'var(--frito-gold)',
                backgroundColor: 'rgba(255, 208, 0, 0.1)',
                padding: '2px 7px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 208, 0, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Sparkles size={10} /> Gemini 3.5 Flash-Lite + Gemini TTS
              </span>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              AI-synthesized spoken agronomic briefings generated dynamically from BigQuery telemetry data.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => fetchBriefing(activeTopic)}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-card)',
              color: 'var(--text-secondary)',
              fontSize: '0.72rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title="Regenerate talk track using Gemini 3.5 Flash-Lite"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            <span>Regenerate</span>
          </button>

          <button
            onClick={copyTranscript}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-card)',
              color: copied ? 'var(--status-emerald-light)' : 'var(--text-secondary)',
              fontSize: '0.72rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {copied ? <Check size={13} /> : <FileText size={13} />}
            <span>{copied ? 'Copied' : 'Copy Script'}</span>
          </button>
        </div>
      </div>

      {/* Topic Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-card)', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => setActiveTopic('ops')}
          style={{
            padding: '0.4rem 0.85rem',
            borderRadius: '8px',
            backgroundColor: activeTopic === 'ops' ? 'rgba(0, 47, 108, 0.6)' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${activeTopic === 'ops' ? 'var(--frito-gold)' : 'transparent'}`,
            color: activeTopic === 'ops' ? 'var(--frito-gold)' : 'var(--text-secondary)',
            fontSize: '0.75rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          🎙️ Regional Operations Briefing
        </button>

        <button
          onClick={() => setActiveTopic('variety')}
          style={{
            padding: '0.4rem 0.85rem',
            borderRadius: '8px',
            backgroundColor: activeTopic === 'variety' ? 'rgba(0, 47, 108, 0.6)' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${activeTopic === 'variety' ? 'var(--frito-gold)' : 'transparent'}`,
            color: activeTopic === 'variety' ? 'var(--frito-gold)' : 'var(--text-secondary)',
            fontSize: '0.75rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          🥔 Potato Variety & Solids Output
        </button>

        <button
          onClick={() => setActiveTopic('sustainability')}
          style={{
            padding: '0.4rem 0.85rem',
            borderRadius: '8px',
            backgroundColor: activeTopic === 'sustainability' ? 'rgba(0, 47, 108, 0.6)' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${activeTopic === 'sustainability' ? 'var(--frito-gold)' : 'transparent'}`,
            color: activeTopic === 'sustainability' ? 'var(--frito-gold)' : 'var(--text-secondary)',
            fontSize: '0.75rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          🌿 2026 Sustainability & Water Audit
        </button>
      </div>

      {/* Main Audio Player & Spectrum Console */}
      <div style={{
        backgroundColor: 'rgba(3, 7, 18, 0.9)',
        border: '1px solid var(--border-card)',
        borderRadius: '12px',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.25rem'
      }}>
        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          disabled={isLoading || !briefingData}
          style={{
            width: '3.2rem',
            height: '3.2rem',
            borderRadius: '50%',
            backgroundColor: isPlaying ? '#e31937' : '#002F6C',
            border: '2px solid var(--frito-gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            boxShadow: isPlaying ? '0 0 20px rgba(227, 25, 55, 0.5)' : '0 0 16px rgba(0, 47, 108, 0.5)',
            transition: 'all 0.25s ease',
            flexShrink: 0
          }}
          title={isPlaying ? "Pause Briefing" : "Play Executive Audio Briefing"}
        >
          {isPlaying ? <Pause size={22} /> : <Play size={22} style={{ marginLeft: '3px' }} />}
        </button>

        {/* Waveform Canvas Visualizer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--text-primary)' }}>
              {briefingData?.title || 'Loading Briefing Track...'}
            </span>
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <canvas
            ref={canvasRef}
            width={400}
            height={36}
            style={{ width: '100%', height: '36px', borderRadius: '6px', backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          />
        </div>

        {/* Speed Controls */}
        <div style={{ display: 'flex', gap: '0.3rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '6px', border: '1px solid var(--border-card)' }}>
          {[1.0, 1.25, 1.5].map(rate => (
            <button
              key={rate}
              onClick={() => {
                setPlaybackRate(rate);
                if (isPlaying) stopAudio();
              }}
              style={{
                padding: '0.2rem 0.45rem',
                borderRadius: '4px',
                backgroundColor: playbackRate === rate ? 'var(--frito-gold)' : 'transparent',
                color: playbackRate === rate ? '#000' : 'var(--text-secondary)',
                fontSize: '0.68rem',
                fontWeight: '800',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Live Highlighted AI Transcript */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid var(--border-card)',
        borderRadius: '10px',
        padding: '0.85rem 1rem',
        maxHeight: '130px',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <Cpu size={12} style={{ color: 'var(--frito-gold)' }} />
          <span style={{ fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.8px' }}>
            Gemini 3.5 Flash-Lite Generated Talk Track Transcript
          </span>
        </div>

        {isLoading ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Synthesizing executive briefing transcript with Gemini 3.5...
          </div>
        ) : (
          <div style={{ fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--text-primary)' }}>
            {sentences.length > 0 ? (
              sentences.map((sent, idx) => (
                <span
                  key={idx}
                  style={{
                    backgroundColor: currentSentenceIndex === idx ? 'rgba(255, 208, 0, 0.25)' : 'transparent',
                    color: currentSentenceIndex === idx ? '#ffd000' : 'inherit',
                    fontWeight: currentSentenceIndex === idx ? '700' : '400',
                    borderRadius: '3px',
                    padding: '1px 3px',
                    transition: 'all 0.2s ease',
                    display: 'inline'
                  }}
                >
                  {sent}{' '}
                </span>
              ))
            ) : (
              <span>{briefingData?.script}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
