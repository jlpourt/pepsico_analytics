'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Play, Pause, RefreshCw, Sparkles, Radio, Cpu, FileText, Check, Mic } from 'lucide-react';

export default function ExecutiveAudioBriefing({ refreshTrigger, selectedRegion = 'NA' }) {
  const [activeTopic, setActiveTopic] = useState('ops'); // 'ops', 'variety', or 'sustainability'
  const [selectedSpeaker, setSelectedSpeaker] = useState('Callirrhoe'); // 'Callirrhoe', 'Puck', 'Aoede', 'Charon'
  const [briefingData, setBriefingData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState(35);
  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Fetch Briefing Script & Gemini 3.1 Flash TTS Audio from API
  const fetchBriefing = async (topicToFetch, speakerToUse = selectedSpeaker) => {
    setIsLoading(true);
    stopAudio();
    try {
      const response = await fetch('/api/audio-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicToFetch, region: selectedRegion, speaker: speakerToUse })
      });
      if (response.ok) {
        const data = await response.json();
        setBriefingData(data);
        setCurrentTime(0);
      }
    } catch (err) {
      console.error("Failed to fetch audio briefing:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefing(activeTopic, selectedSpeaker);
    return () => {
      stopAudio();
    };
  }, [activeTopic, selectedSpeaker, refreshTrigger, selectedRegion]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setCurrentSentenceIndex(-1);
    setCurrentTime(0);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  const handlePlayPause = () => {
    if (!briefingData || !briefingData.script) return;

    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      // If we have Gemini 3.1 Flash TTS WAV Audio
      if (briefingData.audioUrl) {
        if (!audioRef.current) {
          audioRef.current = new Audio(briefingData.audioUrl);
        } else if (audioRef.current.src !== briefingData.audioUrl) {
          audioRef.current.src = briefingData.audioUrl;
        }

        const audio = audioRef.current;
        audio.playbackRate = playbackRate;

        audio.onloadedmetadata = () => {
          setDuration(audio.duration || 35);
        };

        audio.ontimeupdate = () => {
          setCurrentTime(audio.currentTime);
          setDuration(audio.duration || 35);

          // Sentence tracking for HD audio
          const sentences = briefingData.script.split(/(?<=[.!?])\s+/).filter(Boolean);
          const ratio = audio.currentTime / (audio.duration || 1);
          const idx = Math.min(sentences.length - 1, Math.floor(ratio * sentences.length));
          setCurrentSentenceIndex(idx);
        };

        audio.onended = () => {
          setIsPlaying(false);
          setCurrentSentenceIndex(-1);
          setCurrentTime(audio.duration || 35);
        };

        audio.play().then(() => {
          setIsPlaying(true);
        }).catch(err => {
          console.warn("HTML5 Audio play failed, falling back to Web Speech:", err);
          playWebSpeechFallback();
        });
      } else {
        playWebSpeechFallback();
      }
    }
  };

  const playWebSpeechFallback = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(briefingData.script);
    utterance.rate = playbackRate;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium'))) || voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      setCurrentSentenceIndex(-1);
    };

    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  // Draw Dynamic Waveform Spectrum (Works for both Gemini Flash TTS and Web Audio)
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
          barHeight = Math.sin(phase + i * 0.25) * 16 + Math.cos(phase * 1.8 + i * 0.15) * 12 + 22;
          barHeight = Math.max(5, Math.min(height - 4, barHeight));
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
        phase += 0.18;
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
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      backgroundColor: 'rgba(5, 10, 20, 0.85)',
      border: '1.5px solid rgba(255, 208, 0, 0.3)',
      borderRadius: '16px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      boxShadow: '0 8px 32px rgba(0, 47, 108, 0.35)',
      marginBottom: '1rem',
      backdropFilter: 'blur(16px)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: '2.2rem',
            height: '2.2rem',
            borderRadius: '10px',
            backgroundColor: 'rgba(0, 47, 108, 0.6)',
            border: '1px solid var(--frito-gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--frito-gold)',
            boxShadow: '0 0 12px rgba(255, 208, 0, 0.25)'
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
                color: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Sparkles size={10} /> gemini-3.1-flash-tts-preview
              </span>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Natural conversational speech generated natively by Gemini 3.1 Flash TTS & Gemini 3.5.
            </p>
          </div>
        </div>

        {/* Action Controls & Speaker Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Speaker Selector */}
          <select
            value={selectedSpeaker}
            onChange={(e) => setSelectedSpeaker(e.target.value)}
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(0, 47, 108, 0.5)',
              border: '1px solid var(--frito-gold)',
              color: 'var(--frito-gold)',
              fontSize: '0.7rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <option value="Callirrhoe">🎙️ Callirrhoe (Conversational Female)</option>
            <option value="Puck">🎙️ Puck (Energetic Male)</option>
            <option value="Aoede">🎙️ Aoede (Executive Female)</option>
            <option value="Charon">🎙️ Charon (Deep Male)</option>
          </select>

          <button
            onClick={() => fetchBriefing(activeTopic, selectedSpeaker)}
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
            title="Regenerate talk track and Gemini Flash TTS audio"
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
        backgroundColor: 'rgba(3, 7, 18, 0.95)',
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
            width: '3.4rem',
            height: '3.4rem',
            borderRadius: '50%',
            backgroundColor: isPlaying ? '#e31937' : '#002F6C',
            border: '2px solid var(--frito-gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            boxShadow: isPlaying ? '0 0 24px rgba(227, 25, 55, 0.6)' : '0 0 20px rgba(0, 47, 108, 0.6)',
            transition: 'all 0.25s ease',
            flexShrink: 0
          }}
          title={isPlaying ? "Pause Briefing" : "Play Gemini 3.1 Flash TTS Briefing"}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: '3px' }} />}
        </button>

        {/* Waveform Canvas Visualizer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--text-primary)' }}>
              {briefingData?.title || 'Synthesizing Audio with Gemini 3.1 Flash TTS...'}
            </span>
            <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <canvas
            ref={canvasRef}
            width={400}
            height={36}
            style={{ width: '100%', height: '36px', borderRadius: '6px', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          />
        </div>

        {/* Speed Controls */}
        <div style={{ display: 'flex', gap: '0.3rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '6px', border: '1px solid var(--border-card)' }}>
          {[1.0, 1.25, 1.5].map(rate => (
            <button
              key={rate}
              onClick={() => {
                setPlaybackRate(rate);
                if (audioRef.current) audioRef.current.playbackRate = rate;
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
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid var(--border-card)',
        borderRadius: '10px',
        padding: '0.85rem 1rem',
        maxHeight: '130px',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <Cpu size={12} style={{ color: 'var(--frito-gold)' }} />
          <span style={{ fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.8px' }}>
            Gemini 3.5 Flash-Lite Script Transcript
          </span>
        </div>

        {isLoading ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Generating Gemini 3.1 Flash TTS natural conversational audio...
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
