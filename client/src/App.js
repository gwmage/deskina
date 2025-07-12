import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ReactDiffViewer from 'react-diff-viewer';
import remarkGfm from 'remark-gfm';
import './App.css';

const API_URL = 'http://localhost:3001';
const MAX_MESSAGES = 100; // Keep the last 100 messages in view

const CodeCopyBlock = ({ language, code }) => {
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
        <span>{language}</span>
        <button onClick={handleCopy} className="copy-button">
          {isCopied ? '✅' : '📋'}
        </button>
      </div>
      <pre className={`language-${language}`}>
        <code>{code}</code>
      </pre>
    </div>
  );
};

const CodeBlock = ({node, inline, className, children, ...props}) => {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  return !inline && match ? (
    <CodeCopyBlock language={lang} code={code} />
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
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
          {proposal.originalContent === 'loading' ? (
            <p>Loading original file...</p>
          ) : (
            <ReactDiffViewer
              oldValue={proposal.originalContent || ''}
              newValue={proposal.newContent || ''}
              splitView={true}
              showDiffOnly={false}
            />
          )}
        </div>
        <div className="proposal-actions">
          <button onClick={onReject} className="reject-button">Reject</button>
          <button onClick={onAccept} className="accept-button" disabled={proposal.originalContent === 'loading'}>
            Accept & Save
          </button>
        </div>
      </div>
    </div>
  );
};

const AuthPage = ({ onLoginSuccess }) => {
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
      setStep(2); // Move to next step
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
          <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? 'Sending Code...' : 'Get Verification Code'}
          </button>
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
        <button type="submit" className="auth-button" disabled={isLoading}>
          {isLoading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>
    );
  };
  
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          {/* A simple placeholder logo */}
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 7L12 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 7L12 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 22V12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 4.5L17 9.5" stroke="var(--accent-color)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2>{isLogin ? 'Welcome Back' : 'Create an Account'}</h2>
        
        {isLogin ? (
          <form onSubmit={handleLoginSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required disabled={isLoading} />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={isLoading} />
            </div>
            <button type="submit" className="auth-button" disabled={isLoading}>
              {isLoading ? 'Logging In...' : 'Login'}
            </button>
          </form>
        ) : renderSignupForm()}

        {error && <p className="auth-error">{error}</p>}
        {message && <p className="auth-message">{message}</p>}

        <div className="auth-toggle">
          {isLogin ? (
            <>
              Don't have an account?{' '}
              <button onClick={() => { setIsLogin(!isLogin); resetForm(); }}>Sign Up</button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => { setIsLogin(!isLogin); resetForm(); }}>Login</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};


const Sidebar = ({ sessions, currentSessionId, onSessionClick, onNewConversation, onLogout, isSidebarOpen, onToggle }) => (
  <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
    <div className="sidebar-content">
      <button onClick={onNewConversation} className="new-chat-button">
        + New Chat
      </button>
      <nav className="sessions-list">
        <ul>
          {sessions.map((session) => (
            <li 
              key={session.id} 
              className={session.id === currentSessionId ? 'active' : ''}
              onClick={() => onSessionClick(session.id)}
            >
              {session.title || 'Untitled Conversation'}
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-footer">
        <button onClick={onLogout} className="logout-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span>Logout</span>
        </button>
      </div>
    </div>
  </aside>
);


const App = () => {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('accessToken');
    return token ? { token } : null;
  });
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const currentSessionIdRef = useRef(currentSessionId);
  const [conversation, setConversation] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [error, setError] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalConversations, setTotalConversations] = useState(0);
  const [fileEditProposal, setFileEditProposal] = useState(null);

  const chatEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const prevScrollHeightRef = useRef(null);
  const inputRef = useRef(null);
  
  const electronAPI = window.electronAPI;

  // Effect to auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'; // Reset height to recalculate
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [conversation]);

  useLayoutEffect(() => {
    if (scrollContainerRef.current && prevScrollHeightRef.current) {
      scrollContainerRef.current.scrollTop += scrollContainerRef.current.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = null;
    }
  }, [conversation]);

  const loadSessions = useCallback(async (token) => {
    try {
      const response = await fetch(`${API_URL}/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load sessions');
      const data = await response.json();
      setSessions(data);
    } catch (err) {
      console.error('Session loading error:', err);
      setError('Failed to load your conversations.');
    }
  }, []);

  const fetchSessionHistory = useCallback(async (sessionId, currentPage = 1, shouldConcat = false) => {
    if (!sessionId || sessionId === 'temp') return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}/conversations?page=${currentPage}&limit=20`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch session history');
      const data = await response.json();
      
      const formattedHistory = data.conversations.map(c => ({...c, id: c.id || `db-${Math.random()}`})).reverse();

      setConversation(prev => shouldConcat ? [...formattedHistory, ...prev] : formattedHistory);
      setTotalConversations(data.total);
      setHasMore(data.conversations.length > 0 && (currentPage * 20 < data.total));
      setPage(currentPage);
    } catch (err) {
      console.error('Fetch history error:', err);
      setConversation([]);
      setTotalConversations(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    if (storedToken) {
      const userData = { token: storedToken };
      setUser(userData);
      loadSessions(storedToken);
    }
  }, [loadSessions]);
  
  const handleStop = (isUserInitiated = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    if (isUserInitiated) {
      console.log('User initiated stop.');
    }
  };

  const handleAcceptEdit = async () => {
    if (!fileEditProposal || !electronAPI) return;
    const { filePath, newContent } = fileEditProposal;
    const result = await electronAPI.writeFile({ filePath, content: newContent });
    if (result.success) {
      setConversation(prev => [...prev, { id: `system-${Date.now()}`, role: 'system', content: `✅ File "${filePath}" has been updated successfully.` }]);
    } else {
      setConversation(prev => [...prev, { id: `system-${Date.now()}`, role: 'system', content: `❌ Error updating file "${filePath}": ${result.error}` }]);
    }
    setFileEditProposal(null);
  };

  const handleRejectEdit = () => {
    if (!fileEditProposal) return;
    const { filePath } = fileEditProposal;
    setConversation(prev => [...prev, { id: `system-${Date.now()}`, role: 'system', content: `File edit for "${filePath}" was rejected.` }]);
    setFileEditProposal(null);
  };

  const handleImageChange = (event) => {
    const input = event.target;
    if (!input.files || input.files.length === 0) {
      input.value = '';
      return;
    }

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      setError(`"${file.name}" is not a supported image file.`);
      input.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      const resultStr = reader.result;
      setImagePreview(resultStr);
      const base64String = resultStr.split(',')[1];
      setImageBase64(base64String);
      setError(null); 
    };

    reader.onerror = () => {
      console.error("FileReader error:", reader.error);
      setError("An error occurred while reading the selected file.");
    };

    reader.readAsDataURL(file);
    input.value = '';
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageBase64(null);
  };
  
  const streamResponse = useCallback(async (url, body, signal) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify(body),
        signal: signal,
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred' }));
        throw new Error(errorData.message);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processData = async () => {
        while (true) {
          if (signal.aborted) {
            reader.cancel();
            break;
          }
          try {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            let boundary = buffer.lastIndexOf('\n');
            if (boundary === -1) continue;

            const jsonLines = buffer.substring(0, boundary).split('\n');
            buffer = buffer.substring(boundary + 1);

            for (const line of jsonLines) {
              if (line.trim() === '') continue;
              try {
                const jsonString = line.startsWith('data: ') ? line.substring(5) : line;
                const data = JSON.parse(jsonString);
                
                if (data.type === 'session_id' && currentSessionIdRef.current === 'temp') {
                  setCurrentSessionId(data.payload);
                  setSessions(prev =>
                    prev.map(s => s.id === 'temp' ? { ...s, id: data.payload } : s)
                  );
                } else if (data.type === 'text_chunk') {
                  setConversation(prev => {
                    const newConversation = [...prev];
                    const lastTurnIndex = newConversation.length - 1;
                    const lastTurn = lastTurnIndex >= 0 ? newConversation[lastTurnIndex] : null;

                    if (lastTurn && lastTurn.role === 'model' && lastTurn.isStreaming) {
                      const updatedTurn = {
                        ...lastTurn,
                        content: lastTurn.content + data.payload,
                      };
                      newConversation[lastTurnIndex] = updatedTurn;
                      return newConversation;
                    } else {
                      newConversation.push({ id: `model-${Date.now()}`, role: 'model', content: data.payload, isStreaming: true });
                      return newConversation;
                    }
                  });
                } else if (data.type === 'final') {
                    // Stop any "thinking" message now that we have a final action.
                    setConversation(prev => {
                      const newConversation = [...prev];
                      const lastTurn = newConversation[newConversation.length - 1];
                      if (lastTurn && lastTurn.role === 'model' && lastTurn.isStreaming) {
                         if (lastTurn.content.trim() === '') {
                           return newConversation.slice(0, -1);
                         }
                        lastTurn.isStreaming = false;
                      }
                      return newConversation;
                    });
                    
                    const finalPayload = data.payload;

                    if (finalPayload.action === 'runCommand' && electronAPI) {
                      const { command, args } = finalPayload.parameters;
                      
                      setConversation(prev => [...prev, {
                        id: `action-${Date.now()}`,
                        type: 'action',
                        content: `> **runCommand**: \`${command} ${args.join(' ')}\``
                      }]);

                      const result = await electronAPI.runCommand({ command, args });
                      
                      setConversation(prev => [...prev, {
                        id: `action-result-${Date.now()}`,
                        type: 'action_result',
                        content: result.success ? result.stdout : result.stderr,
                        success: result.success
                      }]);

                      const nextController = new AbortController();
                      abortControllerRef.current = nextController;

                      await streamResponse(
                        `${API_URL}/gemini/tool-result`,
                        {
                          sessionId: currentSessionIdRef.current,
                          command: "runCommand",
                          args: args,
                          result: result,
                        },
                        nextController.signal
                      );
                    } else if (finalPayload.action === 'readFile' && electronAPI) {
                      const { filePath } = finalPayload.parameters;
                      
                      setConversation(prev => [...prev, {
                        id: `action-${Date.now()}`,
                        type: 'action',
                        content: `> **readFile**: \`${filePath}\``
                      }]);

                      const result = await electronAPI.readFile({ filePath });
                      
                      const nextController = new AbortController();
                      abortControllerRef.current = nextController;

                      await streamResponse(
                        `${API_URL}/gemini/tool-result`,
                        {
                          sessionId: currentSessionIdRef.current,
                          command: "readFile",
                          args: { filePath },
                          result: result,
                        },
                        nextController.signal
                      );
                    } else if (finalPayload.action === 'editFile' && electronAPI) {
                        setFileEditProposal({
                          ...finalPayload.parameters,
                          originalContent: 'loading',
                        });
                    } else if (finalPayload.action === 'runScript' && electronAPI) {
                        const { filePath, content } = finalPayload.parameters;
                        const fileCheck = await electronAPI.checkFileExists(filePath);
                        if (!fileCheck.exists) {
                          await electronAPI.writeFile({ filePath, content });
                          setConversation(prev => [...prev, { id: `system-${Date.now()}`, role: 'system', content: `📥 Script downloaded and saved to "${filePath}".` }]);
                        }
                        const result = await electronAPI.runCommand({ command: 'python', args: [filePath] });
                        const nextController = new AbortController();
                        abortControllerRef.current = nextController;
                        await streamResponse(
                          `${API_URL}/gemini/tool-result`,
                           { sessionId: currentSessionIdRef.current, command: 'runScript', args: finalPayload.parameters, result },
                           nextController.signal
                        );
                    } else { 
                        const replyContent = finalPayload.parameters?.content || '```json\n' + JSON.stringify(finalPayload, null, 2) + '\n```';
                        setConversation(prev => {
                          return [...prev, { id: `model-${Date.now()}`, role: 'model', content: replyContent, isStreaming: false }];
                        });
                    }
                }
              } catch (e) {
                console.error('Failed to parse JSON line:', line, e);
              }
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.error('Error reading stream:', err);
              setError('Error processing stream from server.');
            }
            break;
          }
        }
      };
      
      await processData();

    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        console.error('Streaming error:', err);
      }
    } finally {
      setIsLoading(false);
      if (abortControllerRef.current && abortControllerRef.current.signal === signal) {
        abortControllerRef.current = null;
      }
    }
  }, [user, electronAPI]);

  useEffect(() => {
    if (fileEditProposal && fileEditProposal.originalContent === 'loading' && electronAPI) {
      const fetchOriginalFile = async () => {
        const result = await electronAPI.readFile(fileEditProposal.filePath);
        if (result.success) {
          setFileEditProposal(prev => ({ ...prev, originalContent: result.content }));
        } else {
          setFileEditProposal(prev => ({ ...prev, originalContent: `Error: ${result.error}` }));
        }
      };
      fetchOriginalFile();
    }
  }, [fileEditProposal, electronAPI]);

  // Focus input on new conversation or when switching conversations
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [currentSessionId, isLoading]);


  const executeTurn = useCallback(async () => {
    const userMessage = input.trim();
    if (!userMessage && !imageBase64) return;

    handleStop();
    setInput('');
    setImagePreview(null);
    setImageBase64(null);

    const newTurn = { id: `user-${Date.now()}`, role: 'user', content: userMessage, imageBase64: imageBase64 };
    setConversation(prev => [...prev, newTurn]);

    let sessionIdToSend = currentSessionId;
    if (!sessionIdToSend) {
      sessionIdToSend = 'temp';
      setSessions(prev => [{ id: 'temp', title: userMessage.substring(0, 30) }, ...prev]);
      setCurrentSessionId('temp');
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    await streamResponse(`${API_URL}/gemini/generate`, {
      sessionId: sessionIdToSend,
      message: userMessage,
      platform: window.navigator.platform,
      imageBase64: imageBase64,
    }, controller.signal);
  }, [input, imageBase64, currentSessionId, streamResponse]);


  const handleNewConversation = () => {
    setIsLoading(false);
    handleStop(true);
    setConversation([]);
    setCurrentSessionId(null);
    setInput('');
    setImagePreview(null);
    setImageBase64(null);
    setPage(1);
    setHasMore(true);
    setTotalConversations(0);
    setError(null);
  };

  const handleSessionClick = (sessionId) => {
    if (sessionId === currentSessionId) return;
    handleStop(true);
    setCurrentSessionId(sessionId);
    setConversation([]);
    fetchSessionHistory(sessionId, 1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading) {
      handleStop(true);
    } else {
      executeTurn();
    }
    inputRef.current?.focus();
  };

  const handleLoadMore = () => {
    if (!hasMore || isLoading) return;
    prevScrollHeightRef.current = scrollContainerRef.current?.scrollHeight;
    fetchSessionHistory(currentSessionId, page + 1, true);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('accessToken');
    setSessions([]);
    setConversation([]);
    setCurrentSessionId(null);
  };

  const handleLoginSuccess = (token) => {
    localStorage.setItem('accessToken', token);
    const userData = { token };
    setUser(userData);
    loadSessions(token);
  };
  
  const renderWelcomeScreen = () => (
    <div className="welcome-screen">
      <div className="auth-logo">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 7L12 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22 7L12 12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 22V12" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 4.5L17 9.5" stroke="var(--accent-color)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h1>How can I help you today?</h1>
    </div>
  );

  const renderTurn = (turn, index) => {
    let turnRoleClass = '';
    let turnContent = null;

    switch (turn.role) {
      case 'user':
        turnRoleClass = 'user';
        turnContent = (
          <>
            {turn.imageBase64 && (
              <img 
                src={`data:image/png;base64,${turn.imageBase64}`} 
                alt="User upload" 
                className="turn-image" 
              />
            )}
            {turn.content && <div className="turn-content">{turn.content}</div>}
          </>
        );
        break;
      case 'model':
        turnRoleClass = 'assistant';
        turnContent = renderModelTurn(turn);
        break;
      case 'system':
        if (turn.type === 'action') {
          turnRoleClass = 'action-turn';
          turnContent = (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {turn.content}
            </ReactMarkdown>
          );
        } else if (turn.type === 'action_result') {
          turnRoleClass = `action-result-turn ${!turn.success && 'error'}`;
          const codeContent = turn.content
            ? turn.content.replace(/^```\w*\n|```$/g, '')
            : '';
          turnContent = <CodeCopyBlock language="bash" code={codeContent} />;
        } else {
          turnRoleClass = 'system';
          turnContent = <div className="turn-content">{turn.content}</div>;
        }
        break;
      default:
        // This part might now be less likely to be hit for these types,
        // but kept as a fallback.
        if (turn.type === 'action') {
          turnRoleClass = 'action-turn';
          turnContent = (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {turn.content}
            </ReactMarkdown>
          );
        } else if (turn.type === 'action_result') {
          turnRoleClass = `action-result-turn ${!turn.success && 'error'}`;
          const codeContent = turn.content
            ? turn.content.replace(/^```\w*\n|```$/g, '')
            : '';
          turnContent = <CodeCopyBlock language="bash" code={codeContent} />;
        } else {
          return null; // Or a fallback UI
        }
    }

    return (
      <div key={turn.id || index} className={`turn ${turnRoleClass}`}>
        {turnContent}
      </div>
    );
  };
  
  const renderModelTurn = (turn) => {
    let contentToDisplay = '';
    
    try {
        let data = turn.content;

        if (typeof data === 'string') {
            const trimmedData = data.trim();
            if ((trimmedData.startsWith('{') && trimmedData.endsWith('}')) || (trimmedData.startsWith('[') && trimmedData.endsWith(']'))) {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                }
            }
        }

        if (typeof data === 'string') {
            contentToDisplay = data;
        } else if (Array.isArray(data)) {
            contentToDisplay = data
                .filter(part => part.type === 'text' && part.value)
                .map(part => part.value)
                .join('');
        } else if (typeof data === 'object' && data !== null) {
            if (data.action === 'reply' && data.parameters && data.parameters.content) {
                const innerContent = data.parameters.content;
                if (Array.isArray(innerContent)) {
                    contentToDisplay = innerContent
                        .filter(part => part.type === 'text' && part.value)
                        .map(part => part.value)
                        .join('');
                } else if (typeof innerContent === 'string') {
                    contentToDisplay = innerContent;
                }
            } else {
                contentToDisplay = '```json\n' + JSON.stringify(data.parameters || data, null, 2) + '\n```';
            }
        } else {
            contentToDisplay = 'Error: Could not render content.';
        }

    } catch(e) {
        console.error("Failed to render model turn content", e);
        contentToDisplay = "Error displaying response.";
    }

    // The <ReactMarkdown> component will create its own <p> tags for text
    // and the CodeBlock component handles the container for code.
    // We remove the wrapping .turn-content div to prevent style inheritance issues.
    return (
      <ReactMarkdown
        children={contentToDisplay}
        remarkPlugins={[remarkGfm]}
        components={{ code: CodeBlock }}
      />
    );
  };
  
  const visibleConversation = conversation.slice(-MAX_MESSAGES);
  const lastTurn = conversation[conversation.length - 1];
  const isCurrentlyStreaming = lastTurn && lastTurn.role === 'model' && lastTurn.isStreaming;

  if (!user) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSessionClick={handleSessionClick}
        onNewConversation={handleNewConversation}
        onLogout={handleLogout}
        isSidebarOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <main className="chat-container">
        <button className="sidebar-toggle-button" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        </button>
        <div className="conversation" ref={scrollContainerRef}>
          {conversation.length === 0 && !isLoading && renderWelcomeScreen()}
          
          {hasMore && totalConversations > conversation.length && (
            <div className="load-more-container">
              <button onClick={handleLoadMore} disabled={isLoading}>
                Load More Conversations
              </button>
            </div>
          )}

          {visibleConversation.map((turn, index) => renderTurn(turn, index))}
          
          {isLoading && !isCurrentlyStreaming && (
            <div className="turn assistant">
              <div className="turn-content">
                <div className="loading-dots">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="input-area">
          <div className="input-wrapper">
            {imagePreview && (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Preview" className="image-preview" />
                <button onClick={handleRemoveImage} className="remove-image-button">×</button>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isLoading) {
                    handleSubmit(e);
                  }
                }
              }}
              placeholder="Ask Deskina anything..."
              rows="1"
              disabled={isLoading}
            />
            <label htmlFor="file-upload" className="attach-button">📎</label>
            <input id="file-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
            <button onClick={handleSubmit} disabled={isLoading || !input.trim()}>
              {isLoading ? '■' : '▶'}
            </button>
          </div>
        </div>
      </main>
      <EditFileProposal proposal={fileEditProposal} onAccept={handleAcceptEdit} onReject={handleRejectEdit} />
    </div>
  );
};

export default App;