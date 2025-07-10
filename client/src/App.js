import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

const API_URL = 'http://localhost:3001';

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


const Sidebar = ({ sessions, currentSessionId, onSessionClick, onNewConversation, onLogout }) => (
  <aside className="sidebar">
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
    <button onClick={onLogout} className="logout-button">Logout</button>
  </aside>
);

// Main App component
function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('authToken'));
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [modelResponse, setModelResponse] = useState('');
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [conversationPage, setConversationPage] = useState(1);
  const [totalConversations, setTotalConversations] = useState(0);
  const [imageBase64, setImageBase64] = useState('');
  const chatEndRef = useRef(null);
  const scrollRef = useRef(null);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

  const markdownComponents = {
      code: CodeBlock,
  };

  const apiFetch = useCallback(async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      // Handle token expiration
      setAuthToken(null);
      localStorage.removeItem('authToken');
      return;
    }
    return response;
  }, [authToken]);

  const fetchSessionHistory = useCallback(async (sessionIdToFetch, page = 1) => {
    if (!sessionIdToFetch) return;
    
    if (page > 1) {
      setIsHistoryLoading(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await apiFetch(`${API_URL}/session/${sessionIdToFetch}/conversations?page=${page}`);
      if (!response.ok) throw new Error('Failed to fetch session history');
      const data = await response.json();
      
      const parsedConversations = data.conversations.map(c => {
        if (c.role === 'model') {
          try {
            // Attempt to parse the content, which should be a JSON string of an array of actions
            const parsedContent = JSON.parse(c.content);
            return { ...c, content: parsedContent };
          } catch (e) {
            console.warn(`Failed to parse model content for session ${sessionIdToFetch}. Content:`, c.content, e);
            // If parsing fails, return a user-friendly error message within the turn itself
            return { ...c, content: { action: 'reply', parameters: { content: [{ type: 'text', value: `[Error displaying this message: Invalid format]`}] } } };
          }
        }
        return c; // For user roles, content is just a string
      });

      // The server sends messages in descending order (newest first) for pagination.
      // We must reverse the array to display them in chronological order (oldest first).
      const chronologicalConversations = parsedConversations.reverse();
      
      if (page === 1) {
        setHistory(chronologicalConversations);
      } else {
        setHistory(prev => [...chronologicalConversations, ...prev]);
      }
      setTotalConversations(data.totalConversations);

    } catch (error) {
      console.error(`Error fetching history for session ${sessionIdToFetch}:`, error);
      // For new chats, an error is expected. Reset both history and total.
      setHistory([]); 
      setTotalConversations(0);
    } finally {
      setIsLoading(false);
      setIsHistoryLoading(false);
    }
  }, [apiFetch]);
  
  const loadSessions = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_URL}/session`);
      if (!response || !response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      const fetchedSessions = data.sessions || [];
      setSessions(fetchedSessions);

      const urlSessionId = new URLSearchParams(window.location.search).get('sessionId');
      
      if (urlSessionId) {
        setCurrentSessionId(urlSessionId);
      } else if (fetchedSessions.length > 0) {
        const latestSessionId = fetchedSessions[0].id;
        setCurrentSessionId(latestSessionId);
        window.history.replaceState({ sessionId: latestSessionId }, '', `?sessionId=${latestSessionId}`);
      }
    } catch (error) {
      console.error("Error loading sessions:", error);
      setSessions([]);
    }
  }, [apiFetch]);

  // Effect 1: Load sessions list and determine the initial session to display.
  useEffect(() => {
    if (authToken) {
      loadSessions();
    }
  }, [authToken, loadSessions]);

  // Effect 2: Fetch the conversation history whenever the currentSessionId changes.
  useEffect(() => {
    if (currentSessionId) {
      setConversationPage(1); // Reset pagination for the new session
      fetchSessionHistory(currentSessionId, 1);
    } else {
      // When there's no active session (e.g., after clicking "New Chat"), clear the history.
      setHistory([]);
    }
  }, [currentSessionId, fetchSessionHistory]);


  const beforeHistoryRender = useRef(null);
  // This layout effect handles scroll positioning.
  // It's a layout effect to prevent flickering.
  useLayoutEffect(() => {
    const chatWindow = scrollRef.current;
    if (!chatWindow) return;

    // If beforeHistoryRender has a value, it means we're loading more history,
    // so we adjust the scroll position to keep the user's view stable.
    if (beforeHistoryRender.current) {
      const { previousScrollHeight } = beforeHistoryRender.current;
      chatWindow.scrollTop = chatWindow.scrollHeight - previousScrollHeight;
      beforeHistoryRender.current = null;
    } else {
      // Otherwise, it's an initial load or a new message, so scroll to the bottom.
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }
  }, [history]);
  
  // This effect handles smooth scrolling to the bottom while an AI response is streaming.
  useEffect(() => {
    if (modelResponse) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [modelResponse]);

  const handleStop = (isUserInitiated = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setModelResponse(null);
    if (isUserInitiated) {
      setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { content: [{ type: 'text', value: '🛑 Operation cancelled by user.' }] } } }]);
    }
  };

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // result includes "data:image/png;base64," prefix, which we need to remove
        const base64String = reader.result.split(',')[1];
        setImageBase64(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageBase64('');
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset file input
    }
  };

  const streamResponse = async (url, body) => {
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      const response = await apiFetch(url, { // Use the common apiFetch function
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      });

      if (!response || !response.body) {
        throw new Error('The response has no body.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedData = '';
      
      let streamingText = '';
      let accumulatedContent = [];

      const processData = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Stream has ended. We don't set isLoading to false here because
            // the 'final' message from the stream will handle that.
            break;
          }

          accumulatedData += decoder.decode(value, { stream: true });
          const lines = accumulatedData.split('\n');
          accumulatedData = lines.pop(); // Keep the last, possibly incomplete, line

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonString = line.substring(6);
              try {
                const parsedData = JSON.parse(jsonString);

                if (parsedData.type === 'error') {
                  console.error("Server-side error:", parsedData.payload);
                  let errorMessage = `An error occurred: ${parsedData.payload.message}`;
                  if (parsedData.payload.details && parsedData.payload.details.includes('quota')) {
                    errorMessage = '✨ You are a power user! You have exceeded the daily free quota for the AI. Please try again tomorrow.';
                  }
                  setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { content: [{ type: 'text', value: `🤖 Oops! ${errorMessage}` }] } } }]);
                  handleStop(false);
                  return; // Stop processing on error
                }

                if (parsedData.type === 'session_id') {
                  const newSessionId = parsedData.payload;
                  if (newSessionId !== currentSessionId) {
                      setCurrentSessionId(newSessionId);
                      window.history.pushState({ sessionId: newSessionId }, '', `?sessionId=${newSessionId}`);
                  }
                } else if (parsedData.type === 'text_chunk') {
                  streamingText += parsedData.payload;
                  const lastItem = accumulatedContent[accumulatedContent.length - 1];
                  if (lastItem && lastItem.type === 'text') {
                    lastItem.value = streamingText;
                  } else {
                    accumulatedContent.push({ type: 'text', value: streamingText });
                  }
                  setModelResponse({ action: 'reply', parameters: { content: [...accumulatedContent] } });
                } else if (parsedData.type === 'code_chunk') {
                  streamingText = ''; // Reset for next text block
                  accumulatedContent.push(parsedData.payload);
                  setModelResponse({ action: 'reply', parameters: { content: [...accumulatedContent] } });
                } else if (parsedData.type === 'command_exec') {
                  const { command, args } = parsedData.payload;
                  const commandExecutionMessage = { role: 'model', content: { action: 'reply', parameters: { content: [{ type: 'text', value: `🚀 Executing: \`${command} ${args.join(' ')}\`...` }] } } };
                  setHistory(prev => [...prev, commandExecutionMessage]);
                  setModelResponse(null);
                  const result = await window.electron.runCommand(command, args);
                  const resultMessageContent = [{ type: 'text', value: result.success ? '✅ Command finished successfully.' : '❌ Command failed.' }];
                  if (result.output) resultMessageContent.push({ type: 'code', language: 'bash', value: result.output });
                  if (result.error) resultMessageContent.push({ type: 'code', language: 'bash', value: `ERROR: ${result.error}` });
                  const resultMessage = { role: 'model', content: { action: 'reply', parameters: { content: resultMessageContent } } };
                  setHistory(prev => [...prev, resultMessage]);
                  await sendToolResult(command, args, result);
                } else if (parsedData.type === 'final') {
                  setHistory(prev => [...prev, { role: 'model', content: parsedData.payload }]);
                  setModelResponse(null);
                  setIsLoading(false);
                }
              } catch (e) {
                console.error('Failed to parse JSON from stream:', e, jsonString);
              }
            }
          }
        }
      };
      await processData();

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted by user.');
        // The handleStop function takes care of UI updates
        return; 
      }
      
      console.error("Streaming failed:", error);
      setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { content: [{ type: 'text', value: "Sorry, an error occurred with the connection." }] } } }]);
      setIsLoading(false);
    }
  };

  const executeTurn = async () => {
    if ((!prompt.trim() && !imageBase64) || !authToken) return;

    const currentPromptText = prompt;
    setHistory(prev => [...prev, { role: 'user', content: currentPromptText }]);
    setPrompt('');
    setIsLoading(true);
    setModelResponse('');

    const body = {
      userId: 'temp-user-id', // Temporary user ID
      message: currentPromptText,
      sessionId: currentSessionId,
      platform: navigator.platform,
      imageBase64: imageBase64,
    };
    
    // Clear image after sending
    handleRemoveImage();

    await streamResponse(`${API_URL}/gemini/conversation-stream`, body);
  };

  const sendToolResult = async (command, args, result) => {
    if (!currentSessionId) {
      console.error("Cannot send tool result without a session ID.");
      return;
    }
    
    setIsLoading(true);
    setModelResponse('');

    const toolResultText = `TOOL_OUTPUT:\nCommand: ${command} ${args.join(' ')}\nStatus: ${result.success ? 'Success' : 'Failure'}\nOutput:\n${result.output}\nError:\n${result.error || ''}`;
    setHistory(prev => [...prev, { role: 'user', content: `(Sent tool output to AI)\n${result.output || result.error}` }]);

    const body = {
      userId: 'temp-user-id',
      message: toolResultText,
      sessionId: currentSessionId,
      platform: navigator.platform,
    };

    await streamResponse(`${API_URL}/gemini/conversation-stream`, body);
  };

  const handleNewConversation = () => {
    setCurrentSessionId(`temp-${Date.now()}`);
    setHistory([]);
    setTotalConversations(0);
    setConversationPage(1);
    setImageBase64('');
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset file input
    }
  };

  const handleSessionClick = (sessionId) => {
    if (sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
      window.history.pushState({ sessionId }, '', `?sessionId=${sessionId}`);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeTurn();
  };

  const handleLoadMore = () => {
    if (!scrollRef.current) return;
    const nextPage = conversationPage + 1;
    beforeHistoryRender.current = { previousScrollHeight: scrollRef.current.scrollHeight };
    fetchSessionHistory(currentSessionId, nextPage);
    setConversationPage(nextPage);
  };

  const hasMoreConversations = history.length < totalConversations;

  const handleLogout = () => {
    setAuthToken(null);
    localStorage.removeItem('authToken');
  };

  const handleLoginSuccess = (token) => {
    localStorage.setItem('authToken', token);
    setAuthToken(token);
    // window.history.pushState({}, '', '/'); // This is not needed anymore
  };
  
  const renderTurn = (turnContent, index) => {
    if (!turnContent) return null; // Guard against null content

    if (typeof turnContent === 'string') {
        return <ReactMarkdown components={{ code: CodeBlock }} remarkPlugins={[remarkGfm]}>{turnContent}</ReactMarkdown>;
    }
    
    const { action, parameters } = turnContent;

    if (!action || !parameters) {
      // It might be a simple string if it's from old history, or malformed.
      // Let's try to render it as a string.
      return <ReactMarkdown components={{ code: CodeBlock }} remarkPlugins={[remarkGfm]}>{JSON.stringify(turnContent)}</ReactMarkdown>;
    }

    if (action === 'reply') {
      // Handle new structured content format
      if (parameters.content && Array.isArray(parameters.content)) {
        return parameters.content.map((item, i) => {
          const key = `${index}-${i}`;
          if (item.type === 'text') {
            return <div key={key}><ReactMarkdown components={{code: CodeBlock}} remarkPlugins={[remarkGfm]}>{item.value}</ReactMarkdown></div>
          }
          if (item.type === 'code') {
            return <CodeCopyBlock key={key} language={item.language} code={item.value} />
          }
          return null;
        });
      }
      
      // Handle old text format for backward compatibility
      if (parameters.text) {
        return <ReactMarkdown components={{ code: CodeBlock }} remarkPlugins={[remarkGfm]}>{parameters.text}</ReactMarkdown>;
      }

      return null;
    }

    if (action === 'runCommand') {
      const commandString = parameters.command || '';
      const argsString = Array.isArray(parameters.args) ? parameters.args.join(' ') : '';
      return (
        <div className="action-request">
          <strong>Action Planned:</strong> Execute Command
          <pre>{`> ${commandString} ${argsString}`.trim()}</pre>
        </div>
      );
    }
    
    return (
      <div key={index} className="turn">
        <div className="action-request">
          <strong>Action:</strong> {action}
          <pre>{JSON.stringify(parameters, null, 2)}</pre>
        </div>
      </div>
    );
  };
  
  // Simple Router
  if (!authToken) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  const renderModelTurn = (turnContent, index) => {
    const renderedTurn = renderTurn(turnContent, index);
    if (!renderedTurn) return null; // Don't render anything if the turn is empty

    return (
      <div key={index} className="message model">
        {renderedTurn}
      </div>
    );
  };
    
  return (
    <div className="App-container">
        <Sidebar 
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSessionClick={handleSessionClick}
            onNewConversation={handleNewConversation}
            onLogout={handleLogout}
        />
        <main className="main-content">
            <header className="App-header">
                <h1>Deskina AI Agent</h1>
            </header>
            <div className="chat-window" ref={scrollRef}>
                {hasMoreConversations && (
                  <div className="load-more-container">
                    <button onClick={handleLoadMore} disabled={isHistoryLoading} className="load-more-button">
                      {isHistoryLoading ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
                {history.map((item, index) => {
                    switch (item.role) {
                        case 'user':
                            return <div key={index} className="message user"><p>{item.content}</p></div>;
                        case 'model':
                            const content = item.content;
                            if (Array.isArray(content)) {
                                return content.map((action, actionIndex) => 
                                  renderModelTurn(action, `${index}-${actionIndex}`)
                                );
                            }
                            return renderModelTurn(content, index);
                        default:
                            return null;
                    }
                })}
                {isLoading && !modelResponse && <div className="loading-indicator">Thinking...</div>}
                {modelResponse && renderModelTurn(modelResponse, 'streaming')}
                <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSubmit} className="message-form">
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={isLoading ? "Working..." : "Ask Deskina to do something..."}
                    disabled={isLoading}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current.click()} 
                  className="attach-button"
                  disabled={isLoading}
                >
                  📎
                </button>
                {isLoading ? (
                  <button type="button" onClick={() => handleStop(true)} className="stop-button">Stop</button>
                ) : (
                  <button type="submit" disabled={isLoading}>Send</button>
                )}
            </form>
            {imageBase64 && (
              <div className="image-preview">
                <img src={`data:image/png;base64,${imageBase64}`} alt="Preview" />
                <button onClick={handleRemoveImage} className="remove-image-button">×</button>
              </div>
            )}
        </main>
    </div>
  );
}

export default App;
