import React, { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    electronAPI?: {
      selectModelFile: () => Promise<string | null>;
      startServer: (modelPath: string, port?: number) => Promise<{ success: boolean; message?: string }>;
      stopServer: () => Promise<{ success: boolean; message?: string }>;
      getServerStatus: () => Promise<{ running: boolean; pid: number | null; executablePath: string }>;
      onServerLog: (callback: (log: string) => void) => () => void;
      onServerStatusChanged: (callback: (status: { running: boolean; code: number | null }) => void) => () => void;
    };
  }
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export default function App() {
  const [modelPath, setModelPath] = useState<string>('');
  const [isServerRunning, setIsServerRunning] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [showLogs, setShowLogs] = useState<boolean>(true);

  const logEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Check initial server status & subscribe to logs
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getServerStatus().then((status) => {
        setIsServerRunning(status.running);
      });

      const cleanupLogs = window.electronAPI.onServerLog((log) => {
        setLogs((prev) => [...prev.slice(-300), log]);
      });

      const cleanupStatus = window.electronAPI.onServerStatusChanged((status) => {
        setIsServerRunning(status.running);
        setIsStarting(false);
      });

      return () => {
        cleanupLogs();
        cleanupStatus();
      };
    }
  }, []);

  // Auto-scroll logs and chat
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectModel = async () => {
    if (!window.electronAPI) return;
    const selected = await window.electronAPI.selectModelFile();
    if (selected) {
      setModelPath(selected);
    }
  };

  const handleToggleServer = async () => {
    if (!window.electronAPI) return;

    if (isServerRunning) {
      const res = await window.electronAPI.stopServer();
      if (res.success) {
        setIsServerRunning(false);
      }
    } else {
      if (!modelPath) {
        alert('Please select a GGUF model file first.');
        return;
      }
      setIsStarting(true);
      const res = await window.electronAPI.startServer(modelPath);
      if (!res.success) {
        alert(res.message || 'Failed to start llama-server.');
        setIsStarting(false);
      } else {
        setIsServerRunning(true);
        setIsStarting(false);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isGenerating) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setIsGenerating(true);

    try {
      const response = await fetch('http://127.0.0.1:8080/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantResponse = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const json = JSON.parse(dataStr);
              const delta = json.choices[0]?.delta?.content || '';
              assistantResponse += delta;

              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: assistantResponse,
                };
                return updated;
              });
            } catch (err) {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `[Error: Unable to connect to server at 127.0.0.1:8080 - ${err.message}]` },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top Header & Controls */}
      <header className="header-bar">
        <div className="brand-title">
          <div className="brand-icon"></div>
          AgenticAI
        </div>

        <div className="controls-group">
          <div className="model-input-box">
            <span className="model-path-text">
              {modelPath || 'No .gguf model selected'}
            </span>
          </div>

          <button className="btn btn-secondary" onClick={handleSelectModel} disabled={isServerRunning}>
            Browse Model
          </button>

          <button
            className={`btn ${isServerRunning ? 'btn-danger' : ''}`}
            onClick={handleToggleServer}
            disabled={isStarting || (!isServerRunning && !modelPath)}
          >
            {isStarting ? 'Starting...' : isServerRunning ? 'Stop Server' : 'Start Server'}
          </button>
        </div>

        <div className="status-badge">
          <div className={`status-dot ${isServerRunning ? 'online' : isStarting ? 'loading' : ''}`}></div>
          {isServerRunning ? '127.0.0.1:8080' : isStarting ? 'Initializing...' : 'Server Offline'}
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="main-content">
        <div className="chat-container">
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', marginTop: 'auto', marginBottom: 'auto' }}>
                <h3>Welcome to AgenticAI Desktop</h3>
                <p style={{ marginTop: '8px', fontSize: '0.88rem' }}>
                  Select a <code>.gguf</code> model file and click <b>Start Server</b> to begin chatting locally.
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.role}`}>
                  {msg.content}
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="chat-input-bar">
            <input
              type="text"
              className="chat-input"
              placeholder={isServerRunning ? "Type a prompt..." : "Start server to enable chat"}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={!isServerRunning || isGenerating}
            />
            <button className="btn" onClick={handleSendMessage} disabled={!isServerRunning || isGenerating}>
              Send
            </button>
          </div>
        </div>
      </main>

      {/* Log Console Drawer */}
      <footer className="log-drawer">
        <div className="log-header">
          <span>llama-server console logs</span>
          <button
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem' }}
            onClick={() => setShowLogs(!showLogs)}
          >
            {showLogs ? 'Hide Logs' : 'Show Logs'}
          </button>
        </div>
        {showLogs && (
          <div className="log-content">
            {logs.length === 0 ? (
              <span style={{ color: '#475569' }}>Logs will appear here when server starts...</span>
            ) : (
              logs.map((log, i) => <div key={i}>{log}</div>)
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </footer>
    </div>
  );
}
