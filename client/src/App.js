import React, { useState, useRef, useEffect, useCallback } from 'react';
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
        <form onSubmit={handleRequestCode}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required disabled={isLoading} />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Get Verification Code'}
          </button>
        </form>
      );
    }
    return (
      <form onSubmit={handleSignupSubmit}>
        <input type="email" value={email} disabled placeholder="Email" />
        <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Verification Code" required disabled={isLoading} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required disabled={isLoading} />
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm Password" required disabled={isLoading} />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Signing Up...' : 'Sign Up'}
        </button>
      </form>
    );
  };
  
  return (
    <div className="auth-container">
      <div className="auth-form">
        <h1>Hello, Deskina</h1>
        <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
        
        {isLogin ? (
          <form onSubmit={handleLoginSubmit}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required disabled={isLoading} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required disabled={isLoading} />
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Logging In...' : 'Login'}
            </button>
          </form>
        ) : renderSignupForm()}

        {error && <p className="error">{error}</p>}
        {message && <p className="message">{message}</p>}
        <button onClick={() => { setIsLogin(!isLogin); resetForm(); }} className="toggle-auth">
          {isLogin ? 'Need an account? Sign Up' : 'Have an account? Login'}
        </button>
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
  const [modelResponse, setModelResponse] = useState('');
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [imageBase64, setImageBase64] = useState('');
  const chatEndRef = useRef(null);
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

  const fetchSessionHistory = useCallback(async (sessionIdToFetch) => {
    if (!sessionIdToFetch) return;
    setIsLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/session/${sessionIdToFetch}`);
      if (!response.ok) throw new Error('Failed to fetch session history');
      const data = await response.json();
      
      const parsedConversations = data.conversations.map(c => {
        if (c.role === 'model') {
          try {
            // Attempt to parse the content, which should be a JSON string of an array of actions
            return { ...c, content: JSON.parse(c.content) };
          } catch (e) {
            console.warn(`Failed to parse model content for session ${sessionIdToFetch}. Content:`, c.content, e);
            // If parsing fails, return a user-friendly error message within the turn itself
            return { ...c, content: [{ action: 'reply', parameters: { content: [{ type: 'text', value: `[Error displaying this message: Invalid format]`}] } }] };
          }
        }
        return c; // For user roles, content is just a string
      });

      setHistory(parsedConversations);

    } catch (error) {
      console.error(`Error fetching history for session ${sessionIdToFetch}:`, error);
      setHistory([]); // Clear history on a major fetch error
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);
  
  // Fetch all sessions on initial load
  useEffect(() => {
    if (!authToken) return;
    const fetchSessions = async () => {
      try {
        const response = await apiFetch(`${API_URL}/session`);
        if (!response.ok) throw new Error('Failed to fetch sessions');
        const data = await response.json();
        setSessions(data);
      } catch (error) {
        console.error("Error fetching sessions:", error);
      }
    };
    fetchSessions();
  }, [authToken, apiFetch]);

  // Handle session ID from URL on initial load
  useEffect(() => {
    if (!authToken) return;
    const urlSessionId = new URLSearchParams(window.location.search).get('sessionId');
    if (urlSessionId && urlSessionId !== currentSessionId) {
      setCurrentSessionId(urlSessionId);
      fetchSessionHistory(urlSessionId);
    }
    // This effect should only run on auth change or if the initial URL has a session.
    // We pass fetchSessionHistory in dependency array because it's defined with useCallback.
  }, [authToken, fetchSessionHistory]);
  
  // Scroll to bottom effect
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, modelResponse]);

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
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (response.status === 401) {
        setAuthToken(null);
        localStorage.removeItem('authToken');
        return;
      }

      if (!response.body) {
        throw new Error("Response body is missing");
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
    handleStop(false);
    setCurrentSessionId(null);
    setHistory([]);
    window.history.pushState({}, '', '/');
  };

  const handleSessionClick = (sessionId) => {
    if (sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
      fetchSessionHistory(sessionId);
      window.history.pushState({ sessionId }, '', `?sessionId=${sessionId}`);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeTurn();
  };

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
      return <p key={index}>{JSON.stringify(turnContent)}</p>;
    }

    if (action === 'reply') {
      // Handle new structured content format
      if (parameters.content && Array.isArray(parameters.content)) {
        return parameters.content.map((item, i) => {
          const key = `${index}-${i}`;
          if (item.type === 'text') {
            return <div key={key}><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.value}</ReactMarkdown></div>
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
      return (
        <div className="action-request">
          <strong>Action Planned:</strong> Execute Command
          <pre>{`> ${parameters.command} ${parameters.args.join(' ')}`}</pre>
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
            <div className="chat-window">
                {history.map((item, index) => {
                    switch (item.role) {
                        case 'user':
                            return <div key={index} className="message user"><p>{item.content}</p></div>;
                        case 'model':
                            // We need to handle the array of actions here
                            const content = item.content;
                            if (Array.isArray(content)) {
                                return content.map((action, actionIndex) => (
                                    <div key={`${index}-${actionIndex}`} className="message model">
                                        {renderTurn(action, `${index}-${actionIndex}`)}
                                    </div>
                                ));
                            }
                            return <div key={index} className="message model">{renderTurn(content, index)}</div>;
                        default:
                            return null;
                    }
                })}
                {isLoading && !modelResponse && <div className="loading-indicator">Thinking...</div>}
                {modelResponse && <div className="message model">{renderTurn(modelResponse, 'streaming')}</div>}
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
