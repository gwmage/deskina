import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ReactDiffViewer from 'react-diff-viewer-continued';
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

const Sidebar = ({ sessions, currentSessionId, onSessionClick, onNewConversation, onLogout, isSidebarOpen, onLoadMore, hasMore }) => (
  <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
    <div className="sidebar-content">
      <button onClick={onNewConversation} className="new-chat-button">+ New Chat</button>
      <nav className="sessions-list">
        <ul>{sessions.map((session) => (<li key={session.id} className={session.id === currentSessionId ? 'active' : ''} onClick={() => onSessionClick(session.id)}>{session.title || 'Untitled Conversation'}</li>))}</ul>
        {hasMore && <button onClick={onLoadMore} className="load-more-sessions-button">Load More</button>}
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
  const [conversationPage, setConversationPage] = useState(1);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const [sessionPage, setSessionPage] = useState(1);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [lastMessageId, setLastMessageId] = useState(null);
  const toolCallsToExecuteRef = useRef([]);
  const conversationRef = useRef(null);
  const abortControllerRef = useRef(null);
  const prevScrollHeightRef = useRef(null);
  const cwdInputRef = useRef(null);
  const inputRef = useRef(null);
  const focusAfterLoadingRef = useRef(false);
  const isNewSessionRef = useRef(false);
  const cwdRef = useRef(''); // Ref to hold the most up-to-date CWD

  // Sync state with ref whenever it changes
  useEffect(() => {
    cwdRef.current = currentWorkingDirectory;
  }, [currentWorkingDirectory]);

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
      const data = await response.json(); // data should contain { conversations: [], totalCount: number }
      const formattedHistory = data.conversations.map(turn => ({...turn, id: turn.id || `db-${Math.random()}`})).reverse();
      
      const savedCwd = localStorage.getItem(`cwd_${sessionId}`);
      setCurrentWorkingDirectory(savedCwd || defaultCwd);

      setConversation(prev => concat ? [...formattedHistory, ...prev] : formattedHistory);
      // Correctly check if there are more pages
      setHasMoreConversations(page * 20 < data.totalCount);
    } catch (error) {
      console.error('Failed to fetch history:', error);
      setConversation([]);
      setHasMoreConversations(false);
    } finally {
      setIsLoading(false);
    }
  }, [token, defaultCwd]);

  async function executeToolCall(toolCall, cwd) {
    if (!toolCall || !toolCall.name) return null; // Return null on failure

    let result;
    const toolCallId = `tool-call-${Date.now()}`;
    
    // Display the executing tool in the UI
    const executingTurn = {
      id: `executing-${toolCallId}`,
      role: 'system',
      type: 'action_executing', 
      content: `⚡️ **${toolCall.name}**\n\`\`\`json\n${JSON.stringify(toolCall.args, null, 2)}\n\`\`\``,
    };
    setConversation(prev => [...prev, executingTurn]);

    if (toolCall.name === 'runCommand') {
      result = await window.electronAPI.runCommand({ ...toolCall.args, cwd });
    } else if (toolCall.name === 'readFile') {
        if (typeof toolCall.args.filePath !== 'string') {
            result = { success: false, error: `Invalid filePath: Expected a string, but received ${typeof toolCall.args.filePath}. Please provide a valid file path.` };
        } else {
            result = await window.electronAPI.readFile({ filePath: toolCall.args.filePath, cwd });
        }
    } else if (toolCall.name === 'runScript') {
      result = await window.electronAPI.runScript({ name: toolCall.args.name, token: token, cwd });
    } else if (toolCall.name === 'editFile') {
      // editFile is handled via proposal UI, not direct execution here
      setEditProposal({ ...toolCall.args, originalContent: 'loading', toolCallId: toolCallId });
      try {
          const originalContentResult = await window.electronAPI.readFile({filePath: toolCall.args.filePath, cwd });
          if (originalContentResult.success) {
            setEditProposal(prev => ({ ...prev, originalContent: originalContentResult.content }));
          } else {
            setEditProposal(prev => ({ ...prev, originalContent: `Error loading file: ${originalContentResult.error}`}));
          }
      } catch (e) {
          setEditProposal(prev => ({ ...prev, originalContent: `Error loading file: ${e.message}`}));
      }
      return null; 
    } else {
       result = { success: true, stdout: `Tool ${toolCall.name} executed.`};
    }

    const uiContent = result.stdout || result.stderr || result.error || (result.success ? `Tool ${toolCall.name} completed.` : `Tool ${toolCall.name} failed.`);
    const resultTurn = { id: `result-${toolCallId}`, role: 'system', type: 'action_result', content: uiContent, success: result.success };
    
    // Use a functional update to avoid race conditions with conversation state
    setConversation(prev => [...prev, resultTurn]);

    // Return a structured result for batch sending
    return {
      toolCall,
      result
    };
  }
  
  async function executeAndProcessAllTools(toolCalls) {
      if (!toolCalls || toolCalls.length === 0) {
          setIsLoading(false);
          return;
      }
      
      const allResults = [];
      let currentCwdInLoop = cwdRef.current; // Initialize from ref, not state

      // Use a sequential for...of loop to ensure commands like 'cd' complete
      // before the next command runs.
      for (const toolCall of toolCalls) {
          const res = await executeToolCall(toolCall, currentCwdInLoop);
          
          if (res) { // executeToolCall might return null for proposals
            // Check for CWD changes from runCommand
            if (res.toolCall.name === 'runCommand' && res.result.success && res.result.newCwd) {
              const newCwd = res.result.newCwd;
              currentCwdInLoop = newCwd; // Update local CWD for the next iteration
              
              // Update React state and localStorage, which also updates the ref via useEffect
              setCurrentWorkingDirectory(newCwd);
              const sessionId = sessionIdRef.current;
              if (sessionId) {
                localStorage.setItem(`cwd_${sessionId}`, newCwd);
              }
            }
            allResults.push(res);
          }
      }
      
      // After all tools have been executed sequentially, send all results back in one batch.
      if(allResults.length > 0) {
        await sendToolResults(allResults, currentCwdInLoop);
      }
      // We don't return the CWD here anymore as it's handled within the loop and by sendToolResults
  }


  async function processStream(response, sessionId) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentLastMessageId = null; // Use a local var for the current stream
    toolCallsToExecuteRef.current = []; // Reset for new stream

    while (true) {
      const {
        done,
        value
      } = await reader.read();
      if (done) {
        // Only set loading to false if there are no more actions to take.
        // Otherwise, the loading state will be handled by the tool execution flow.
        if (toolCallsToExecuteRef.current.length === 0) {
          setIsLoading(false);
        }

        setConversation(prev => {
          if (!currentLastMessageId) return prev;
          return prev.map(t => (t.id === currentLastMessageId ? { ...t,
            isStreaming: false
          } : t));
        });
        
        // Stream is done, now execute all collected tool calls
        if (toolCallsToExecuteRef.current.length > 0) {
            executeAndProcessAllTools(toolCallsToExecuteRef.current); 
        }
        break;
      }

      buffer += decoder.decode(value, {
        stream: true
      });

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
                    setSessions(prev => prev.map(s => (s.id === 'temp' ? { ...s, id: newId } : s)));
                    localStorage.setItem(`cwd_${newId}`, currentWorkingDirectory);
                }
          } else if (data.type === 'text_chunk') {
                const textChunk = data.payload;
            setConversation(prev => {
                  const lastTurn = prev.length > 0 ? prev[prev.length - 1] : null;
                  if (lastTurn && lastTurn.id === currentLastMessageId && lastTurn.role === 'model') {
                    const updatedTurn = { ...lastTurn, content: lastTurn.content + textChunk };
                    return [...prev.slice(0, -1), updatedTurn];
              } else {
                    const newTurn = { id: `model-${Date.now()}`, role: 'model', content: textChunk, isStreaming: true };
                    currentLastMessageId = newTurn.id;
                    return [...prev, newTurn];
                  }
                });
            } else if (data.type === 'action') {
                setConversation(prev => prev.map(t => (t.id === currentLastMessageId ? { ...t,
                  isStreaming: false
                } : t)));
                toolCallsToExecuteRef.current.push(data.payload);
            } else if (data.type === 'server_action_result') {
                // Handle results from server-side tools like createScript
                const { success, message } = data.payload;
                const resultTurn = {
                    id: `result-server-${Date.now()}`,
                    role: 'system',
                    type: 'action_result',
                    content: message,
                    success: success,
                };
                setConversation(prev => [...prev, resultTurn]);
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

  async function sendToolResults(results, finalCwd) { 
    const sessionId = sessionIdRef.current;
    if (!sessionId || results.length === 0) return;
    
    setIsLoading(true);
    
    const tool_responses = results.map(({
      toolCall,
      result
    }) => ({
      name: toolCall.name,
      result: result
    }));
    
    try {
      const response = await fetch(`${API_URL}/gemini/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId,
          platform: window.navigator.platform,
          currentWorkingDirectory: finalCwd,
          tool_responses,
        }),
      });
      if (!response.ok) throw new Error('Failed to send tool results');
      await processStream(response, sessionId);
    } catch (error) {
      console.error('Tool results submission failed:', error);
      setIsLoading(false);
    }
  }
  
  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
      fetchSessions(storedToken, 1);
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
    if (conversationPage > 1) fetchSessionHistory(currentSessionId, conversationPage, true);
  }, [conversationPage, currentSessionId, fetchSessionHistory]);

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

  const fetchSessions = async (authToken, page = 1) => {
    try {
      const response = await fetch(`${API_URL}/sessions?page=${page}&limit=20`, { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!response.ok) throw new Error('Failed to load sessions');
      const newSessions = await response.json();
      setHasMoreSessions(newSessions.length > 0);
      if (page === 1) {
        setSessions(newSessions);
      } else {
        setSessions(prev => [...prev, ...newSessions]);
      }
    } catch (error) {
      console.error("Error fetching sessions:", error);
    }
  };

  const handleLoadMoreSessions = () => {
    const nextPage = sessionPage + 1;
    setSessionPage(nextPage);
    fetchSessions(token, nextPage);
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
    setHasMoreConversations(false);
    setConversationPage(1);
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
    setHasMoreConversations(true);
    setConversationPage(1);
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

      const newTurn = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userMessage,
        imageBase64
      };
      
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

  const handleLoadMoreConversations = () => {
    if (conversationRef.current) prevScrollHeightRef.current = conversationRef.current.scrollHeight;
    setConversationPage(prev => prev + 1);
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setToken(null);
    setConversation([]);
    setSessions([]);
    setCurrentSessionId(null);
    setSessionPage(1);
    setHasMoreSessions(true);
  };

  const handleLoginSuccess = (token) => {
    localStorage.setItem('accessToken', token);
    setToken(token);
    setIsAuthenticated(true);
    fetchSessions(token, 1);
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
        } else if (turn.type === 'action_executing') {
          turnRoleClass = 'system action-executing';
          turnContent = <ReactMarkdown children={turn.content} remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }} />;
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
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSessionClick={handleSessionClick}
        onNewConversation={handleNewConversation}
        onLogout={handleLogout}
        isSidebarOpen={isSidebarOpen}
        onLoadMore={handleLoadMoreSessions}
        hasMore={hasMoreSessions}
      />
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
          {hasMoreConversations && <div className="load-more-container"><button onClick={handleLoadMoreConversations} disabled={isLoading}>Load More Conversations</button></div>}
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
          window.electronAPI.editFile({ filePath: editProposal.filePath, newContent: editProposal.newContent, cwd: currentWorkingDirectory })
              .then(result => {
                  if(result.success) {
                      console.log("File saved successfully");
                      sendToolResults([{ toolCall: { name: 'editFile', args: editProposal }, result: { success: true, message: `File ${editProposal.filePath} has been updated.` } }], currentWorkingDirectory);
                  } else {
                      console.error("Failed to save file:", result.error);
                      const errorTurn = { id: `result-edit-fail-${Date.now()}`, role: 'system', type: 'action_result', content: `Failed to save file: ${result.error}`, success: false };
                      setConversation(prev => [...prev, errorTurn]);
                  }
              });
          setEditProposal(null);
      }} onReject={() => {
          sendToolResults([{ toolCall: { name: 'editFile', args: editProposal }, result: { success: false, message: 'User rejected the file edit proposal.' } }], currentWorkingDirectory);
          setEditProposal(null);
      }} />
    </div>
  );
};

export default App;