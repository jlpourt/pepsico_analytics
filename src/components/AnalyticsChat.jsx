'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';

export default function AnalyticsChat() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: "Hi, I'm the AgriFlow AI Analyst. I can query our crop database and help you audit moisture levels, yield reports, and fertilizer logs. Ask me anything!"
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);

  const suggestedQuestions = [
    "Summarize crop yield by region",
    "List variety averages for moisture",
    "Any high moisture warnings?",
    "Describe fertilizer rates used by Sujit"
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (textToSend) => {
    const activeText = textToSend || query;
    if (!activeText.trim()) return;

    setMessages(prev => [...prev, { sender: 'user', text: activeText }]);
    if (!textToSend) setQuery('');
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: activeText })
      });

      if (!response.ok) throw new Error("AI query failed");

      const result = await response.json();
      setMessages(prev => [...prev, { sender: 'bot', text: result.answer }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { sender: 'bot', text: "Sorry, I encountered an error querying the data: " + error.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      {/* Chat Messages */}
      <div className="chat-messages scrollable-chat">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-bubble-wrapper ${msg.sender === 'user' ? 'chat-user' : 'chat-bot'}`}>
            <div className="chat-avatar">
              {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className="chat-bubble">
              <span className="chat-bubble-text">{msg.text}</span>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-bubble-wrapper chat-bot">
            <div className="chat-avatar">
              <Bot size={14} />
            </div>
            <div className="chat-bubble chat-loading">
              <Loader2 className="animate-spin" size={14} />
              <span>Analyzing records on Vertex AI...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggested Questions */}
      <div className="chat-suggestions">
        <span className="suggestions-label flex-center gap-1"><Sparkles size={11} className="icon-gold" /> Ask:</span>
        <div className="suggestions-list">
          {suggestedQuestions.map((q, idx) => (
            <button 
              key={idx}
              onClick={() => handleSend(q)}
              disabled={isLoading}
              className="suggestion-tag"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input box */}
      <div className="chat-input-bar">
        <input
          type="text"
          placeholder="Ask AI Analyst..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={isLoading}
          className="chat-input"
        />
        <button 
          onClick={() => handleSend()} 
          disabled={isLoading || !query.trim()}
          className="btn-chat-send"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
