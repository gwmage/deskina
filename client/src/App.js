import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ReactDiffViewer from 'react-diff-viewer';
import remarkGfm from 'remark-gfm';
import './App.css';

const API_URL = 'http://localhost:3001';
const MAX_MESSAGES = 100; // Keep the last 100 messages in view

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

const CommandExecution = ({ command, args }) => {
  const fullCommand = `${command} ${args.join(' ')}`;
  return (
    <div className="command-container">
      <div className="command-header">
        <span className="command-icon">⚡️</span>
        <span className="command-label">Executing Command</span>
      </div>
      <pre className="command-content">
        <code>{fullCommand}</code>
      </pre>
    </div>
  );
};

// 기존 CommandResult는 삭제하고 아래의 새 구현으로 대체합니다.
const CommandResult = ({ success, content }) => {
  const language = success ? 'bash' : 'error';
  const headerText = success ? '✅ Command Result' : '❌ Command Failed';

  return (
    <div className={`command-result-container ${success ? 'success' : 'error'}`}>
      <CodeCopyBlock language={language} code={content} headerText={headerText} />
    </div>
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [currentWorkingDirectory, setCurrentWorkingDirectory] = useState('');
  const [defaultCwd, setDefaultCwd] = useState(null); // Initialize with null
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

  const conversationStateRef = useRef(conversation);
  const conversationRef = useRef(null);
  const abortControllerRef = useRef(null);
  const prevScrollHeightRef = useRef(null);
  const cwdInputRef = useRef(null);
  const inputRef = useRef(null); // Ref for the textarea
  const focusAfterLoadingRef = useRef(false); // Ref to trigger focus after loading
  const isNewSessionRef = useRef(false); // Ref to track if we are in a new session flow

  const focusInput = () => {
    // Use a timeout to ensure the focus command runs after the current render cycle.
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  useEffect(() => {
    const initializeCwd = async () => {
      try {
        const homeDir = await window.electronAPI.getHomeDir();
        const lastSessionId = localStorage.getItem('currentSessionId');
        let initialCwd = homeDir;

        if (lastSessionId) {
          const savedCwd = localStorage.getItem(`cwd_${lastSessionId}`);
          if (savedCwd) {
            initialCwd = savedCwd;
          }
        }
        
        setDefaultCwd(homeDir);
        setCurrentWorkingDirectory(initialCwd);
      } catch (error) {
        console.error('Failed to initialize CWD:', error);
        setDefaultCwd('~'); // Fallback
        setCurrentWorkingDirectory('~');
      }
    };
    initializeCwd();
  }, []);

  useEffect(() => {
    // This effect handles focusing the input after a loading state has finished.
    if (!isLoading && focusAfterLoadingRef.current) {
      focusInput();
      focusAfterLoadingRef.current = false; // Reset the ref
    }
  }, [isLoading]);

  useEffect(() => {
    if (isEditingCwd && cwdInputRef.current) {
      cwdInputRef.current.focus();
    }
  }, [isEditingCwd]);

  const fetchSessionHistory = useCallback(async (sessionId, page = 1, concat = false) => {
    if (!sessionId || sessionId === 'temp' || !defaultCwd) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}/conversations?page=${page}&limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch session history');
      }
      const data = await response.json();
      
      const formattedHistory = data.conversations.map(turn => {
        let newTurn = { ...turn, id: turn.id || `db-${Math.random()}` };
        
        // Attempt to parse content if it's a system action result and a string
        if (newTurn.role === 'system' && newTurn.type === 'action_result' && typeof newTurn.content === 'string') {
          try {
            const parsedContent = JSON.parse(newTurn.content);
            // This is risky if content can be a non-JSON string. Let's be more specific.
            // A better check would be to see if the string looks like our result object.
            if (typeof parsedContent === 'object' && parsedContent !== null && ('success' in parsedContent)) {
               newTurn.content = parsedContent.content; // Or whatever structure is expected
               newTurn.success = parsedContent.success;
            }
          } catch (e) {
            // It wasn't a JSON string, so leave it as is.
          }
        } else if (newTurn.role === 'model' && typeof newTurn.content === 'string') {
            try {
                const parsedContent = JSON.parse(newTurn.content);
                if (typeof parsedContent === 'object' && parsedContent !== null && parsedContent.action) {
                    // It's a tool call, keep it as a string for renderTurn to parse
                }
            } catch(e) {
                // Not a tool call, it's just text.
            }
        }

        return newTurn;
      }).reverse();

      const savedCwd = localStorage.getItem(`cwd_${sessionId}`);
      setCurrentWorkingDirectory(savedCwd || defaultCwd);

      setConversation(prev => concat ? [...formattedHistory, ...prev] : formattedHistory);
      setHasMore(data.conversations.length > 0 && (page * 20 < data.total));
    } catch (error) {
      console.error('Failed to fetch history:', error);
      setConversation([]); // Clear on error
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [token, defaultCwd]);

  // Define functions that depend on each other without useCallback to avoid initialization errors
  // due to circular dependencies. They will close over the latest state on each render.
  async function executeToolCall(toolCall) {
    if (!toolCall || !toolCall.name) {
      console.error('executeToolCall called with invalid toolCall:', toolCall);
      return;
    }

    if (toolCall.name === 'runCommand') {
        const commandExecutionTurn = {
          id: `exec-${toolCall.id}`,
          role: 'system',
          type: 'action',
          content: `> **runCommand**: \`${toolCall.args.command} ${(toolCall.args.args || []).join(' ')}\``,
        };
        setConversation(prev => [...prev, commandExecutionTurn]);

      const result = await window.electronAPI.runCommand({...toolCall.args, cwd: currentWorkingDirectory});
      const resultTurn = {
        id: `result-${toolCall.id}`,
        role: 'system',
        type: 'action_result',
        content: result.stdout || result.stderr || result.error,
        success: result.success,
      };
      setConversation(prev => [...prev, resultTurn]);
      await sendToolResult(toolCall.name, toolCall.id, result);
    } else if (toolCall.name === 'editFile') {
      const originalContent = await window.electronAPI.readFile(toolCall.args.filePath);
      setEditProposal({ ...toolCall.args, originalContent });
    } else if (toolCall.name === 'readFile') {
      const readFileTurn = {
        id: `exec-${toolCall.id}`,
        role: 'system',
        type: 'action',
        content: `> **readFile**: Reading file \`${toolCall.args.filePath}\``,
      };
      setConversation(prev => [...prev, readFileTurn]);

      const result = await window.electronAPI.readFile(toolCall.args.filePath);

      const resultTurn = {
          id: `result-${toolCall.id}`,
          role: 'system',
          type: 'action_result',
          success: result.success,
          content: result.success ? result.content : result.error,
      };
      setConversation(prev => [...prev, resultTurn]);
      
      if (result.success) {
        await sendToolResult(toolCall.name, toolCall.id, result.content);
      } else {
        await sendToolResult(toolCall.name, toolCall.id, { error: result.error });
      }
    } else if (toolCall.name === 'createScript') {
      const createScriptTurn = {
        id: `exec-${toolCall.id}`,
        role: 'system',
        type: 'action',
        content: `> **createScript**: \`${toolCall.args.scriptName}\``,
      };
      setConversation(prev => [...prev, createScriptTurn]);
      const result = await window.electronAPI.createScript(toolCall.args);
      const resultTurn = {
        id: `result-${toolCall.id}`,
        role: 'system',
        type: 'action_result',
        content: result.stdout || result.stderr || result.error,
        success: result.success,
      };
      setConversation(prev => [...prev, resultTurn]);
      await sendToolResult(toolCall.name, toolCall.id, result);
    }
  }

  async function processStream(response, currentSessionId) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
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

          if (data.type === 'session_id' && currentSessionId === 'temp') {
            setCurrentSessionId(data.payload);
            setSessions(prev =>
              prev.map(s => s.id === 'temp' ? { ...s, id: data.payload } : s)
            );
          } else if (data.type === 'text_chunk') {
            // setIsLoading(false); // Stop loading when first text arrives
            setConversation(prev => {
              const newConversation = [...prev];
              const lastTurnIndex = newConversation.length - 1;
              const lastTurn = lastTurnIndex >= 0 ? newConversation[lastTurnIndex] : null;

              if (lastTurn && lastTurn.role === 'model' && lastTurn.isStreaming) {
                const updatedTurn = { ...lastTurn, content: lastTurn.content + data.payload };
                newConversation[lastTurnIndex] = updatedTurn;
                return newConversation;
              } else {
                return [...newConversation, { id: `model-${Date.now()}`, role: 'model', content: data.payload, isStreaming: true }];
              }
            });
          } else if (data.type === 'error') {
            setConversation(prev => [...prev, {
              id: `error-${Date.now()}`, role: 'system', content: `Error processing tool result: ${data.payload.message}`, isComplete: true, isError: true
            }]);
            setIsLoading(false);
          } else if (data.type === 'final') {
            const finalPayload = data.payload;
            setConversation(prev => {
              const newConversation = [...prev];
              const lastTurn = newConversation[newConversation.length - 1];
              if (lastTurn && lastTurn.role === 'model' && lastTurn.isStreaming) {
                if (lastTurn.content.trim() === '' && !finalPayload.action) {
                  return newConversation.slice(0, -1);
                }
                lastTurn.isStreaming = false;
                // If there's an action, make sure it's part of the content for rendering
                if (finalPayload.action) {
                    lastTurn.content = JSON.stringify({ action: finalPayload.action, parameters: finalPayload.parameters });
                }
              } else if (finalPayload.action) {
                // If there was no streaming text but there is an action, create a new turn for it.
                newConversation.push({
                  id: `model-${Date.now()}`,
                  role: 'model',
                  content: JSON.stringify({ action: finalPayload.action, parameters: finalPayload.parameters }),
                  isStreaming: false,
                });
              }
              return newConversation;
            });

            if (finalPayload.action) {
              const toolCall = {
                name: finalPayload.action,
                id: `tool-call-${Date.now()}`,
                args: finalPayload.parameters
              };

              // We need a slight delay to ensure the state update from above is processed
              // before we start executing the tool call which might also update the state.
              setTimeout(() => executeToolCall(toolCall), 50);

            } else {
              // If there's no action, the process is complete.
              setIsLoading(false);
            }
             if (finalPayload.parameters?.content) {
              setConversation(prev => [...prev, { id: `model-${Date.now()}`, role: 'model', content: finalPayload.parameters.content, isStreaming: false }]);
            }
          }
        } catch (e) {
          console.error('Failed to parse JSON line:', line, e);
        }
      }
    }
  }

  async function sendToolResult(toolCallName, toolCallId, output) {
    if (!currentSessionId || currentSessionId === 'temp') {
      console.error('sendToolResult: Invalid or temporary Session ID. Aborting submission.');
      return;
    }
    setIsLoading(true); // Start loading when sending a tool result
    try {
      const response = await fetch(`${API_URL}/gemini/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          sessionId: currentSessionId,
          platform: window.navigator.platform,
          currentWorkingDirectory: currentWorkingDirectory,
          tool_response: { name: toolCallName, id: toolCallId, result: output }
        }),
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send tool result and get follow-up.');
      }
      await processStream(response, currentSessionId);
    } catch (error) {
      console.error('Tool result submission or follow-up stream failed:', error);
      setConversation(prev => [...prev, {
        id: `error-${Date.now()}`, role: 'system', content: `Error processing tool result: ${error.message}`
      }]);
    }
  }

  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
      fetchSessions(storedToken);
      
      const lastSessionId = localStorage.getItem('currentSessionId');
      if (lastSessionId) {
        setCurrentSessionId(lastSessionId);
      }
    }
  }, []);

  useEffect(() => {
    // Fetch history when session changes, but not for new temporary sessions
    if (currentSessionId && currentSessionId !== 'temp') {
      if (isNewSessionRef.current) {
        // This is a new session that was just created. The conversation is already in state.
        // Don't fetch history, just reset the flag.
        isNewSessionRef.current = false;
      } else {
        // This is an existing session the user switched to, so fetch its history.
        fetchSessionHistory(currentSessionId, 1, false);
      }
    }
  }, [currentSessionId, fetchSessionHistory]);
  
  useEffect(() => {
    // Fetch more history when page changes (for "Load More")
    if (currentPage > 1) {
      fetchSessionHistory(currentSessionId, currentPage, true);
    }
  }, [currentPage]);

  useEffect(() => {
    sessionIdRef.current = currentSessionId;
    if (currentSessionId && currentSessionId !== 'temp') {
      localStorage.setItem('currentSessionId', currentSessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    conversationStateRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    const lastMessage = conversation[conversation.length - 1];
    // If there's a new last message, scroll to it.
    // This prevents scrolling when old messages are prepended.
    if (lastMessage && lastMessage.id !== lastMessageId) {
      scrollToBottom();
      setLastMessageId(lastMessage.id);
    }
  }, [conversation, lastMessageId]);

  useLayoutEffect(() => {
    // If we have a stored scroll height, it means we've just loaded more messages.
    if (prevScrollHeightRef.current !== null && conversationRef.current) {
      // Adjust scroll position to keep the view stable.
      const scrollDifference = conversationRef.current.scrollHeight - prevScrollHeightRef.current;
      conversationRef.current.scrollTop += scrollDifference;
      prevScrollHeightRef.current = null; // Reset after adjustment
    }
  }, [conversation]);


  const fetchSessions = async (authToken) => {
    try {
      const response = await fetch(`${API_URL}/sessions`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!response.ok) throw new Error('Failed to load sessions');
      const data = await response.json();
      setSessions(data);
    } catch (error) {
      console.error("Error fetching sessions:", error);
    }
  };

  const scrollToBottom = () => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  };

  const handleNewConversation = () => {
    setIsLoading(false);
    setConversation([]);
    setCurrentSessionId(null);
    if (defaultCwd) setCurrentWorkingDirectory(defaultCwd);
    setInput('');
    setImagePreview(null);
    setImageBase64(null);
    setHasMore(true);
    setCurrentPage(1);
    focusAfterLoadingRef.current = true; // Set ref to focus after potential loading
    isNewSessionRef.current = true; // Flag that we are starting a new session
  };

  const handleSessionClick = (sessionId) => {
    if (sessionId === currentSessionId) return;
    isNewSessionRef.current = false; // Flag that we are switching to an existing session
    setCurrentSessionId(sessionId);
    const savedCwd = localStorage.getItem(`cwd_${sessionId}`);
    if (defaultCwd) setCurrentWorkingDirectory(savedCwd || defaultCwd);
    setConversation([]);
    setHasMore(true);
    setCurrentPage(1);
    focusAfterLoadingRef.current = true; // Set ref to focus after history loads
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setIsLoading(false);
    } else {
      const userMessage = input.trim();
      if (!userMessage && !imageBase64) return;
      
      setIsLoading(true);
      focusAfterLoadingRef.current = true; // Set ref to focus after this submission loading ends

      setInput('');
      setImagePreview(null);
      setImageBase64(null);

      // Focus the input right after submitting, using a timeout to ensure it runs after the re-render.
      // REMOVED focusInput() from here

      const newTurn = { id: `user-${Date.now()}`, role: 'user', content: userMessage, imageBase64: imageBase64 };
      setConversation(prev => [...prev, newTurn]);

      let sessionIdToSend = currentSessionId;
      if (!sessionIdToSend) {
        isNewSessionRef.current = true; // Flag that this is a new session
        sessionIdToSend = 'temp';
        const newTempSession = { id: 'temp', title: userMessage.substring(0, 30) };
        setSessions(prev => [newTempSession, ...prev]);
        setCurrentSessionId('temp');
        setCurrentWorkingDirectory(defaultCwd);
        localStorage.setItem(`cwd_temp`, defaultCwd);
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      fetch(`${API_URL}/gemini/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: sessionIdToSend,
          message: userMessage,
          platform: window.navigator.platform,
          imageBase64: imageBase64,
          currentWorkingDirectory: currentWorkingDirectory, // Pass CWD to backend
        }),
        signal: controller.signal,
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to generate response');
        }
        processStream(response, sessionIdToSend);
      })
      .catch(error => {
        console.error('Error:', error);
        setIsLoading(false); // Stop loading on error
      })
      .finally(() => {
        // REMOVED setIsLoading(false) from here. It will be handled by the stream processor.
        if (abortControllerRef.current && abortControllerRef.current.signal === controller.signal) {
          abortControllerRef.current = null;
        }
      });
    }
  };

  const handleLoadMore = () => {
    if (conversationRef.current) {
      // Store the scroll height *before* new content is added.
      prevScrollHeightRef.current = conversationRef.current.scrollHeight;
    }
    setCurrentPage(prev => prev + 1);
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
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
        let modelContent;
        let isActionResult = false;
        let actionResultSuccess = false;

        try {
          // Check if turn.content is a string that looks like JSON
          if (typeof turn.content === 'string' && turn.content.trim().startsWith('{')) {
              modelContent = JSON.parse(turn.content);
              if (modelContent.type === 'action_result') {
                isActionResult = true;
                actionResultSuccess = modelContent.success;
                modelContent = modelContent.content;
              }
          } else {
              modelContent = turn.content; // It's just a string
          }
        } catch (e) {
          modelContent = turn.content;
        }
        
        if (isActionResult) {
          turnContent = <CommandResult success={actionResultSuccess} content={modelContent} />;
        } else if (typeof modelContent === 'object' && modelContent !== null && modelContent.action) {
            const { action, parameters } = modelContent;
            let commandString = '';
            if (action === 'runCommand' && parameters.args) {
                commandString = parameters.args.join(' ');
            }
            turnContent = <CommandExecution command={action} args={[commandString]} />;
        } else {
           turnContent = <ReactMarkdown children={turn.content} remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }} />;
        }
        break;

      case 'tool':
        turnRoleClass = 'assistant';
        turnContent = <ReactMarkdown children={turn.content} remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }} />;
        break;

      case 'system':
        if (turn.type === 'action') {
          turnRoleClass = 'system action-text';
          turnContent = (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {turn.content}
            </ReactMarkdown>
          );
        } else if (turn.type === 'action_result') {
          turnRoleClass = 'system action-result';
          turnContent = <CommandResult success={turn.success} content={turn.content} />;
        } else {
          turnRoleClass = 'system';
          turnContent = <div className="turn-content">{turn.content}</div>;
        }
        break;

      default:
        return null;
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

  if (!isAuthenticated) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (!defaultCwd) {
    return (
      <div className="loading-screen">
        <div className="loading-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    );
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
        <header className="chat-header">
          <button className="sidebar-toggle-button" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
          </button>
          <div className="cwd-container">
            <span className="cwd-icon">📁</span>
            {isEditingCwd ? (
              <input
                ref={cwdInputRef}
                type="text"
                value={currentWorkingDirectory}
                onChange={(e) => setCurrentWorkingDirectory(e.target.value)}
                onBlur={() => {
                  setIsEditingCwd(false);
                  if (currentSessionId) {
                    localStorage.setItem(`cwd_${currentSessionId}`, currentWorkingDirectory);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                className="cwd-input"
              />
            ) : (
              <span onClick={() => setIsEditingCwd(true)} className="cwd-text" title={currentWorkingDirectory}>
                {currentWorkingDirectory}
              </span>
            )}
          </div>
        </header>
        <div className="conversation" ref={conversationRef}>
          {conversation.length === 0 && !isLoading && renderWelcomeScreen()}
          
          {hasMore && (
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
        </div>
        <div className="input-area">
          <div className="input-wrapper">
            {imagePreview && (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Preview" className="image-preview" />
                <button onClick={() => {setImagePreview(null); setImageBase64(null);}} className="remove-image-button">×</button>
              </div>
            )}
            <textarea
              ref={inputRef} // Attach ref to textarea
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
            <input id="file-upload" type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  setImagePreview(reader.result);
                  setImageBase64(reader.result.split(',')[1]);
                };
                reader.readAsDataURL(file);
                e.target.value = null; // Reset file input
              }
            }} style={{ display: 'none' }} />
            <button onClick={handleSubmit} disabled={isLoading || (!input.trim() && !imageBase64)}>
              {isLoading ? '■' : '▶'}
            </button>
          </div>
        </div>
      </main>
      <EditFileProposal proposal={editProposal} onAccept={() => {}} onReject={() => setEditProposal(null)} />
    </div>
  );
};

export default App;