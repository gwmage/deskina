import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ReactDiffViewer from 'react-diff-viewer';
import remarkGfm from 'remark-gfm';
import './App.css';

const API_URL = 'http://localhost:3001';
const MAX_MESSAGES = 100;

const CodeCopyBlock = ({ language, code, headerText }) => {
  const [isCopied, setIsCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };
  return (
    <div className="code-container">
      <div className="code-header">
        <span>{headerText || language}</span>
        <button onClick={handleCopy} className="copy-button">{isCopied ? '✅' : '📋'}</button>
      </div>
      <pre className={`language-${language}`}><code>{code}</code></pre>
    </div>
  );
};

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');
  return !inline && match ? <CodeCopyBlock language={lang} code={code} /> : <code className={className} {...props}>{children}</code>;
};

const CommandResult = ({ success, content }) => {
  const language = success ? 'bash' : 'error';
  const headerText = success ? '✅ Command Result' : '❌ Command Failed';
  return <div className={`command-result-container ${success ? 'success' : 'error'}`}><CodeCopyBlock language={language} code={content} headerText={headerText} /></div>;
};

const EditFileProposal = ({ proposal, onAccept, onReject }) => {
  if (!proposal) return null;
  return (
    <div className="edit-proposal-overlay">
      <div className="edit-proposal-card">
        <h3>File Edit Proposal</h3>
        <p>The AI wants to make the following changes to:</p>
        <code className="file-path">{proposal.filePath}</code>
        <div className="diff-container">
          {proposal.originalContent === 'loading' ? <p>Loading original file...</p> : <ReactDiffViewer oldValue={proposal.originalContent || ''} newValue={proposal.newContent || ''} splitView={true} showDiffOnly={false} />}
        </div>
        <div className="proposal-actions">
          <button onClick={onReject} className="reject-button">Reject</button>
          <button onClick={onAccept} className="accept-button" disabled={proposal.originalContent === 'loading'}>Accept & Save</button>
        </div>
      </div>
    </div>
  );
};

const AuthPage = ({ onLoginSuccess }) => {
  // This component remains unchanged.
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState(1); // For multi-step signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/request-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setMessage(data.message);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
    }
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/complete-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      onLoginSuccess(data.accessToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        onLoginSuccess(data.accessToken);
    } catch (err) {
        setError(err.message);
    } finally {
        setIsLoading(false);
    }
  };
  
  const resetForm = () => {
    setStep(1);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setError('');
    setMessage('');
  };

  const renderSignupForm = () => {
    if (step === 1) {
      return (
        <form onSubmit={handleRequestCode} className="auth-form">
          <div className="form-group">
            <label htmlFor="signup-email">Email</label>
            <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required disabled={isLoading} />
          </div>
          <button type="submit" className="auth-button" disabled={isLoading}>{isLoading ? 'Sending Code...' : 'Get Verification Code'}</button>
        </form>
      );
    }
    return (
      <form onSubmit={handleSignupSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="signup-email-disabled">Email</label>
          <input id="signup-email-disabled" type="email" value={email} disabled placeholder="you@example.com" />
        </div>
        <div className="form-group">
          <label htmlFor="code">Verification Code</label>
          <input id="code" type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter code" required disabled={isLoading} />
        </div>
        <div className="form-group">
          <label htmlFor="signup-password">Password</label>
          <input id="signup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={isLoading} />
        </div>
        <div className="form-group">
          <label htmlFor="confirm-password">Confirm Password</label>
          <input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required disabled={isLoading} />
        </div>
        <button type="submit" className="auth-button" disabled={isLoading}>{isLoading ? 'Creating Account...' : 'Sign Up'}</button>
      </form>
    );
  };
  
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 7L12 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 7L12 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 22V12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 4.5L17 9.5" stroke="var(--accent-color)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        <h2>{isLogin ? 'Welcome Back' : 'Create an Account'}</h2>
        {isLogin ? <form onSubmit={handleLoginSubmit} className="auth-form"><div className="form-group"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required disabled={isLoading} /></div><div className="form-group"><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={isLoading} /></div><button type="submit" className="auth-button" disabled={isLoading}>{isLoading ? 'Logging In...' : 'Login'}</button></form> : renderSignupForm()}
        {error && <p className="auth-error">{error}</p>}
        {message && <p className="auth-message">{message}</p>}
        <div className="auth-toggle">{isLogin ? <>Don't have an account? <button onClick={() => { setIsLogin(!isLogin); resetForm(); }}>Sign Up</button></> : <>Already have an account? <button onClick={() => { setIsLogin(!isLogin); resetForm(); }}>Login</button></>}</div>
      </div>
    </div>
  );
};

const Sidebar = ({ sessions, currentSessionId, onSessionClick, onNewConversation, onLogout, isSidebarOpen }) => (
  <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
    <div className="sidebar-content">
      <button onClick={onNewConversation} className="new-chat-button">+ New Chat</button>
      <nav className="sessions-list">
        <ul>{sessions.map((session) => (<li key={session.id} className={session.id === currentSessionId ? 'active' : ''} onClick={() => onSessionClick(session.id)}>{session.title || 'Untitled Conversation'}</li>))}</ul>
      </nav>
      <div className="sidebar-footer">
        <button onClick={onLogout} className="logout-button"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg><span>Logout</span></button>
      </div>
    </div>
  </aside>
);

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [currentWorkingDirectory, setCurrentWorkingDirectory] = useState('');
  const [defaultCwd, setDefaultCwd] = useState('');
  const [isEditingCwd, setIsEditingCwd] = useState(false);
  const sessionIdRef = useRef(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editProposal, setEditProposal] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [lastMessageId, setLastMessageId] = useState(null);
  const conversationRef = useRef(null);
  const abortControllerRef = useRef(null);
  const prevScrollHeightRef = useRef(null);
  const cwdInputRef = useRef(null);
  const inputRef = useRef(null);
  const focusAfterLoadingRef = useRef(false);
  const isNewSessionRef = useRef(false);

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 0);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const homeDir = await window.electronAPI.getHomeDir();
        setDefaultCwd(homeDir);

        const lastSessionId = localStorage.getItem('currentSessionId');
        const savedCwd = lastSessionId ? localStorage.getItem(`cwd_${lastSessionId}`) : null;
        setCurrentWorkingDirectory(savedCwd || homeDir);
      } catch (error) {
        console.error('Failed to initialize CWD:', error);
        setDefaultCwd('~'); // Fallback
        setCurrentWorkingDirectory('~');
      }
    };
    initializeApp();
  }, []);

  useEffect(() => { if (!isLoading && focusAfterLoadingRef.current) { focusInput(); focusAfterLoadingRef.current = false; } }, [isLoading]);
  useEffect(() => { if (isEditingCwd && cwdInputRef.current) { cwdInputRef.current.focus(); } }, [isEditingCwd]);

  const fetchSessionHistory = useCallback(async (sessionId, page = 1, concat = false) => {
    if (!sessionId || sessionId === 'temp' || !defaultCwd) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}/conversations?page=${page}&limit=20`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error('Failed to fetch session history');
      const data = await response.json();
      const formattedHistory = data.conversations.map(turn => ({...turn, id: turn.id || `db-${Math.random()}`})).reverse();
      
      const savedCwd = localStorage.getItem(`cwd_${sessionId}`);
      setCurrentWorkingDirectory(savedCwd || defaultCwd);

      setConversation(prev => concat ? [...formattedHistory, ...prev] : formattedHistory);
      setHasMore(data.conversations.length > 0 && (page * 20 < data.total));
    } catch (error) {
      console.error('Failed to fetch history:', error);
      setConversation([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [token, defaultCwd]);

  async function executeToolCall(toolCall) {
    if (!toolCall || !toolCall.name) return;
    
    let result;
    if (toolCall.name === 'runCommand') {
      result = await window.electronAPI.runCommand({ ...toolCall.args, cwd: currentWorkingDirectory });
      // IMPORTANT: If cd command is successful, update CWD state and persist it
      if (result.success && result.newCwd) {
        setCurrentWorkingDirectory(result.newCwd);
        const sessionId = sessionIdRef.current;
        if (sessionId) {
          localStorage.setItem(`cwd_${sessionId}`, result.newCwd);
        }
      }
    } else if (toolCall.name === 'editFile') {
      setEditProposal({ ...toolCall.args, originalContent: 'loading' });
      try {
          const originalContent = await window.electronAPI.readFile(toolCall.args.filePath);
          setEditProposal(prev => ({ ...prev, originalContent: originalContent.content }));
      } catch (e) {
          setEditProposal(prev => ({ ...prev, originalContent: `Error loading file: ${e.message}`}));
      }
      return;
    } else {
       // Placeholder for other tool calls
       result = { success: true, stdout: `Tool ${toolCall.name} executed.`};
    }

    const resultTurn = { id: `result-${toolCall.id}`, role: 'system', type: 'action_result', content: result.stdout || result.stderr || result.error, success: result.success };
    setConversation(prev => [...prev, resultTurn]);
    await sendToolResult(toolCall.name, toolCall.id, result);
  }

  async function processStream(response, sessionId) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastMessageId = null; 

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
          setIsLoading(false);
          setConversation(prev => {
            if (!lastMessageId) return prev;
            return prev.map(t => (t.id === lastMessageId ? { ...t, isStreaming: false } : t));
          });
          break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the potentially incomplete last line in buffer

      for (const line of lines) {
        if (line.trim().startsWith('data: ')) {
          const jsonString = line.trim().substring(5);
          if (!jsonString) continue;

          try {
            const data = JSON.parse(jsonString);
            
            if (data.type === 'session_id') {
                const newId = data.payload;
                if (sessionId === 'temp' || !sessionId) {
                    setCurrentSessionId(newId);
                    // Update temp session in list with real ID
                    setSessions(prev => prev.map(s => (s.id === 'temp' ? { ...s, id: newId } : s)));
                    // Persist CWD for the new session
                    localStorage.setItem(`cwd_${newId}`, currentWorkingDirectory);
                }
            } else if (data.type === 'text_chunk') {
                const textChunk = data.payload;
                for (const char of textChunk) {
                  setConversation(prev => {
                    const lastTurn = prev.length > 0 ? prev[prev.length - 1] : null;
                    if (lastTurn && lastTurn.id === lastMessageId && lastTurn.role === 'model') {
                      const updatedTurn = { ...lastTurn, content: lastTurn.content + char };
                      return [...prev.slice(0, -1), updatedTurn];
                    } else {
                      const newTurn = { id: `model-${Date.now()}`, role: 'model', content: char, isStreaming: true };
                      lastMessageId = newTurn.id;
                      return [...prev, newTurn];
                    }
                  });
                  await new Promise(resolve => setTimeout(resolve, 10)); // Artificial delay for typewriter effect
                }
            } else if (data.type === 'action') {
                // Stop rendering the last message as streaming if we get a tool call
                setConversation(prev => prev.map(t => (t.id === lastMessageId ? { ...t, isStreaming: false } : t)));
                executeToolCall({ name: data.payload.name, id: `tool-call-${Date.now()}`, args: data.payload.args });
            } else if (data.type === 'final') {
                // Final message is handled by the 'done' condition
            }
          } catch (e) {
            console.error('Failed to parse JSON line:', jsonString, e);
          }
        }
      }
    }
  }

  async function sendToolResult(toolName, toolCallId, output) {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/gemini/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sessionId, platform: window.navigator.platform, currentWorkingDirectory, tool_response: { name: toolName, id: toolCallId, result: output } }),
      });
      if (!response.ok) throw new Error('Failed to send tool result');
      await processStream(response, sessionId);
    } catch (error) {
      console.error('Tool result submission failed:', error);
      setIsLoading(false);
    }
  }
  
  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
      fetchSessions(storedToken);
      const lastSessionId = localStorage.getItem('currentSessionId');
      if (lastSessionId) setCurrentSessionId(lastSessionId);
    }
  }, []);

  useEffect(() => {
    if (currentSessionId && currentSessionId !== 'temp') {
      if (!isNewSessionRef.current) {
        fetchSessionHistory(currentSessionId, 1, false);
      }
      isNewSessionRef.current = false;
    }
  }, [currentSessionId, fetchSessionHistory]);
  
  useEffect(() => {
    if (currentPage > 1) fetchSessionHistory(currentSessionId, currentPage, true);
  }, [currentPage, currentSessionId, fetchSessionHistory]);

  useEffect(() => {
    sessionIdRef.current = currentSessionId;
    if (currentSessionId && currentSessionId !== 'temp') localStorage.setItem('currentSessionId', currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    const lastMessage = conversation[conversation.length - 1];
    if (lastMessage && lastMessage.id !== lastMessageId) {
      scrollToBottom();
      setLastMessageId(lastMessage.id);
    }
  }, [conversation, lastMessageId]);

  useLayoutEffect(() => {
    if (prevScrollHeightRef.current !== null && conversationRef.current) {
      const scrollDifference = conversationRef.current.scrollHeight - prevScrollHeightRef.current;
      conversationRef.current.scrollTop += scrollDifference;
      prevScrollHeightRef.current = null;
    }
  }, [conversation]);

  const fetchSessions = async (authToken) => {
    try {
      const response = await fetch(`${API_URL}/sessions`, { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!response.ok) throw new Error('Failed to load sessions');
      setSessions(await response.json());
    } catch (error) {
      console.error("Error fetching sessions:", error);
    }
  };

  const scrollToBottom = () => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  };

  const handleNewConversation = () => {
    setIsLoading(false);
    if(abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setConversation([]);
    setCurrentSessionId(null);
    if (defaultCwd) setCurrentWorkingDirectory(defaultCwd);
    setInput('');
    setImageBase64(null);
    setImagePreview(null);
    setHasMore(false);
    setCurrentPage(1);
    focusInput();
    isNewSessionRef.current = true;
  };
  
  const handleSessionClick = (sessionId) => {
    if (sessionId === currentSessionId) return;
    isNewSessionRef.current = false; // Flag that we are switching to an existing session
    setCurrentSessionId(sessionId);
    const savedCwd = localStorage.getItem(`cwd_${sessionId}`);
    if (defaultCwd) setCurrentWorkingDirectory(savedCwd || defaultCwd);
    setConversation([]);
    setHasMore(true);
    focusAfterLoadingRef.current = true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading) {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setIsLoading(false);
    } else {
      const userMessage = input.trim();
      if (!userMessage && !imageBase64) return;
      
      const newTurn = { id: `user-${Date.now()}`, role: 'user', content: userMessage, imageBase64 };
      
      let tempConversation = [...conversation, newTurn];
      let sessionIdToSend = currentSessionId;

      if (!sessionIdToSend) {
        isNewSessionRef.current = true;
        const newTempId = 'temp';
        const newTempSession = { id: newTempId, title: userMessage.substring(0, 30) || 'New Chat' };
        setSessions(prev => [newTempSession, ...prev]);
        setCurrentSessionId(newTempId);
        sessionIdToSend = newTempId;
        // Save current CWD for the temp session
        localStorage.setItem(`cwd_${newTempId}`, currentWorkingDirectory);
      }

      setConversation(tempConversation);
      setIsLoading(true);
      focusAfterLoadingRef.current = true;
      setInput('');
      setImageBase64(null);
      setImagePreview(null);
      
      const controller = new AbortController();
      abortControllerRef.current = controller;
      fetch(`${API_URL}/gemini/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sessionId: sessionIdToSend, message: userMessage, platform: window.navigator.platform, imageBase64, currentWorkingDirectory }),
        signal: controller.signal,
      }).then(response => {
        if (!response.ok) throw new Error('Failed to generate response');
        processStream(response, sessionIdToSend);
      }).catch(error => {
        if (error.name === 'AbortError') {
          console.log('Fetch aborted.');
          const resultTurn = { id: `result-aborted-${Date.now()}`, role: 'system', type: 'action_result', content: 'Request cancelled by user.', success: false };
          setConversation(prev => [...prev.map(t => ({...t, isStreaming: false})), resultTurn]);
        } else {
          console.error('Error:', error);
          setConversation(prev => [...prev, {id: `error-${Date.now()}`, role: 'system', type: 'action_result', content: `Error: ${error.message}`, success: false}])
        }
        setIsLoading(false);
      });
    }
  };

  const handleLoadMore = () => {
    if (conversationRef.current) prevScrollHeightRef.current = conversationRef.current.scrollHeight;
    setCurrentPage(prev => prev + 1);
  };
  
  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setToken(null);
    setConversation([]);
    setSessions([]);
    setCurrentSessionId(null);
  };

  const handleLoginSuccess = (token) => {
    localStorage.setItem('accessToken', token);
    setToken(token);
    setIsAuthenticated(true);
    fetchSessions(token);
  };

  const renderWelcomeScreen = () => (
    <div className="welcome-screen">
      <div className="auth-logo"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 7L12 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 7L12 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 22V12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 4.5L17 9.5" stroke="var(--accent-color)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
      <h1>How can I help you today?</h1>
    </div>
  );
  
  const renderTurn = (turn, index) => {
    // This function remains unchanged for now.
    let turnRoleClass = '';
    let turnContent = null;

    switch (turn.role) {
      case 'user':
        turnRoleClass = 'user';
        turnContent = <>{turn.imageBase64 && <img src={`data:image/png;base64,${turn.imageBase64}`} alt="User upload" className="turn-image"/>}{turn.content && <div className="turn-content">{turn.content}</div>}</>;
        break;
      case 'model':
        turnRoleClass = 'assistant';
        turnContent = <ReactMarkdown children={turn.content} remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }} />;
        break;
      case 'system':
        if (turn.type === 'action_result') {
          turnRoleClass = 'system action-result';
          turnContent = <CommandResult success={turn.success} content={turn.content} />;
        } else {
          turnRoleClass = 'system';
          turnContent = <div className="turn-content">{turn.content}</div>;
        }
        break;
      default: return null;
    }
    return <div key={turn.id || index} className={`turn ${turnRoleClass}`}>{turnContent}</div>;
  };

  const visibleConversation = conversation.slice(-MAX_MESSAGES);
  const lastTurn = conversation[conversation.length - 1];
  const isCurrentlyStreaming = lastTurn && lastTurn.role === 'model' && lastTurn.isStreaming;

  if (!isAuthenticated) return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  if (!defaultCwd) return <div className="loading-screen"><div className="loading-dots"><span></span><span></span><span></span></div></div>;

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar sessions={sessions} currentSessionId={currentSessionId} onSessionClick={handleSessionClick} onNewConversation={handleNewConversation} onLogout={handleLogout} isSidebarOpen={isSidebarOpen} />
      <main className="chat-container">
        <header className="chat-header">
          <button className="sidebar-toggle-button" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          <div className="cwd-container">
            <span className="cwd-icon">📁</span>
            {isEditingCwd ? <input ref={cwdInputRef} type="text" value={currentWorkingDirectory} onChange={(e) => setCurrentWorkingDirectory(e.target.value)} onBlur={() => {setIsEditingCwd(false); if (currentSessionId) localStorage.setItem(`cwd_${currentSessionId}`, currentWorkingDirectory);}} onKeyDown={(e) => {if (e.key === 'Enter') e.target.blur();}} className="cwd-input" /> : <span onClick={() => setIsEditingCwd(true)} className="cwd-text" title={currentWorkingDirectory}>{currentWorkingDirectory}</span>}
          </div>
        </header>
        <div className="conversation" ref={conversationRef}>
          {conversation.length === 0 && !isLoading && renderWelcomeScreen()}
          {hasMore && <div className="load-more-container"><button onClick={handleLoadMore} disabled={isLoading}>Load More Conversations</button></div>}
          {visibleConversation.map((turn, index) => renderTurn(turn, index))}
          {isLoading && !isCurrentlyStreaming && <div className="turn assistant"><div className="turn-content"><div className="loading-dots"><span></span><span></span><span></span></div></div></div>}
        </div>
        <div className="input-area">
          <div className="input-wrapper">
            {imagePreview && <div className="image-preview-container"><img src={imagePreview} alt="Preview" className="image-preview" /><button onClick={() => {setImagePreview(null); setImageBase64(null);}} className="remove-image-button">×</button></div>}
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isLoading) handleSubmit(e); }}} placeholder="Ask Deskina anything..." rows="1" disabled={isLoading} />
            <label htmlFor="file-upload" className="attach-button">📎</label>
            <input id="file-upload" type="file" accept="image/*" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => { setImagePreview(reader.result); setImageBase64(reader.result.split(',')[1]); }; reader.readAsDataURL(file); e.target.value = null; } }} style={{ display: 'none' }} />
            <button onClick={handleSubmit} disabled={isLoading || (!input.trim() && !imageBase64)}>{isLoading ? '■' : '▶'}</button>
          </div>
        </div>
      </main>
      <EditFileProposal proposal={editProposal} onAccept={() => {
          // This needs to be implemented properly
          console.log("Accepting edit", editProposal);
          // Actually perform the edit
          window.electronAPI.editFile({ filePath: editProposal.filePath, newContent: editProposal.newContent })
              .then(result => {
                  if(result.success) {
                      console.log("File saved successfully");
                      sendToolResult('editFile', `tool-edit-${Date.now()}`, { success: true, message: `File ${editProposal.filePath} has been updated.` });
                  } else {
                      console.error("Failed to save file:", result.error);
                      // Optionally, inform the user of the failure within the chat
                      const errorTurn = { id: `result-edit-fail-${Date.now()}`, role: 'system', type: 'action_result', content: `Failed to save file: ${result.error}`, success: false };
                      setConversation(prev => [...prev, errorTurn]);
                  }
              });
          setEditProposal(null);
      }} onReject={() => {
          sendToolResult('editFile', `tool-edit-${Date.now()}`, { success: false, message: 'User rejected the file edit proposal.' });
          setEditProposal(null);
      }} />
    </div>
  );
};

export default App;