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
  const chatEndRef = useRef(null);
  const eventSourceRef = useRef(null);

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
      setHistory(data.conversations.map(c => ({
        role: c.role,
        content: c.role === 'model' ? JSON.parse(c.content) : c.content
      })));
    } catch (error) {
      console.error(`Error fetching history for session ${sessionIdToFetch}:`, error);
      setHistory([]); // Clear history on error
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
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsLoading(false);
    setModelResponse(null);
    if (isUserInitiated) {
      setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { content: [{ type: 'text', value: '🛑 Operation cancelled by user.' }] } } }]);
    }
  };

  const executeTurn = async () => {
    if (!prompt.trim()) return;

    const currentPromptText = prompt;
    setHistory(prev => [...prev, { role: 'user', content: currentPromptText }]);
    setPrompt('');
    setIsLoading(true);
    setModelResponse('');

    const platform = navigator.platform;
    const userId = 'temp-user-id'; // Temporary user ID
    let url = `${API_URL}/gemini/conversation-stream?message=${encodeURIComponent(currentPromptText)}&userId=${userId}&platform=${platform}`;
    if (currentSessionId) {
      url += `&sessionId=${currentSessionId}`;
    }

    eventSourceRef.current = new EventSource(url);
    let streamingText = '';
    let accumulatedContent = [];

    eventSourceRef.current.onmessage = async (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        
        if (parsedData.type === 'error') {
          console.error("Server-side error:", parsedData.payload);
          let errorMessage = `An error occurred: ${parsedData.payload.message}`;
          if (parsedData.payload.details && parsedData.payload.details.includes('quota')) {
            errorMessage = '✨ You are a power user! You have exceeded the daily free quota for the AI. Please try again tomorrow.';
          }
          setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { content: [{ type: 'text', value: `🤖 Oops! ${errorMessage}` }] } } }]);
          handleStop(false); // Auto-stop, not user initiated
          return;
        }

        if (parsedData.type === 'session_id') {
            const newSessionId = parsedData.payload;
            if (newSessionId !== currentSessionId) {
                setCurrentSessionId(newSessionId);
                window.history.pushState({ sessionId: newSessionId }, '', `?sessionId=${newSessionId}`);
                
                const refetchSessions = async () => {
                    try {
                        const response = await apiFetch(`${API_URL}/session`);
                        if (response && response.ok) {
                            const data = await response.json();
                            setSessions(data);
                        }
                    } catch (error) {
                        console.error("Error refetching sessions:", error);
                    }
                };
                refetchSessions();
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
          // Command execution is a blocking action for the stream
          const { command, args } = parsedData.payload;
          
          // Add a message to history indicating the command is about to run
          const commandExecutionMessage = {
            role: 'model',
            content: {
              action: 'reply',
              parameters: {
                content: [{ type: 'text', value: `🚀 Executing: \`${command} ${args.join(' ')}\`...` }]
              }
            }
          };
          setHistory(prev => [...prev, commandExecutionMessage]);
          setModelResponse(null); // Clear any streaming response

          try {
            // Execute the command via Electron's main process
            const result = await window.electron.runCommand(command, args);
            
            // Create a result message to show the user
            const resultMessageContent = [
              { type: 'text', value: result.success ? '✅ Command finished successfully.' : '❌ Command failed.' }
            ];
            
            if (result.output) {
              resultMessageContent.push({ type: 'code', language: 'bash', value: result.output });
            }
            if (result.error) {
              resultMessageContent.push({ type: 'code', language: 'bash', value: `ERROR: ${result.error}` });
            }

            const resultMessage = {
              role: 'model',
              content: { action: 'reply', parameters: { content: resultMessageContent } }
            };
            setHistory(prev => [...prev, resultMessage]);

            // Now, send the result back to the AI for the next turn
            await sendToolResult(command, args, result);

          } catch (error) {
            console.error('Failed to execute command:', error);
            const errorMessage = {
              role: 'model',
              content: {
                action: 'reply',
                parameters: {
                  content: [{ type: 'text', value: `An error occurred while trying to run the command: ${error.message}` }]
                }
              }
            };
            setHistory(prev => [...prev, errorMessage]);
          }

        } else if (parsedData.type === 'final') {
          // The stream is over. The 'final' payload contains the original actions
          // that the model intended. We've already processed them (reply, command)
          // and added their results to history. So, we don't need to add the
          // final payload to the history again, as it would be redundant.
          // Just close the stream and finalize the state.
          setModelResponse(null);
          setIsLoading(false);
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
        }
      } catch (error) {
        console.error("Failed to parse message data", error);
      }
    };

    eventSourceRef.current.onerror = (err) => {
      console.error("EventSource failed:", err);
      setIsLoading(false);
      eventSourceRef.current.close();
      setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { text: "Sorry, an error occurred with the stream." } } }]);
    };
  };

  const sendToolResult = async (command, args, result) => {
    if (!currentSessionId) {
      console.error("Cannot send tool result without a session ID.");
      return;
    }
    
    setIsLoading(true);
    setModelResponse('');

    const toolResultText = `TOOL_OUTPUT:\nCommand: ${command} ${args.join(' ')}\nStatus: ${result.success ? 'Success' : 'Failure'}\nOutput:\n${result.output}\nError:\n${result.error || ''}`;

    // Add tool output to history visually
    setHistory(prev => [...prev, { role: 'user', content: `(Sent tool output to AI)\n${result.output || result.error}` }]);

    const platform = navigator.platform;
    const userId = 'temp-user-id'; // Temporary user ID
    const url = `${API_URL}/gemini/conversation-stream?message=${encodeURIComponent(toolResultText)}&sessionId=${currentSessionId}&userId=${userId}&platform=${platform}`;
    
    eventSourceRef.current = new EventSource(url);
    let streamingText = '';
    let accumulatedContent = [];

    eventSourceRef.current.onmessage = (event) => {
       try {
        const parsedData = JSON.parse(event.data);

        if (parsedData.type === 'error') {
          console.error("Server-side error:", parsedData.payload);
          let errorMessage = `An error occurred: ${parsedData.payload.message}`;
          if (parsedData.payload.details && parsedData.payload.details.includes('quota')) {
            errorMessage = '✨ You are a power user! You have exceeded the daily free quota for the AI. Please try again tomorrow.';
          }
          setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { content: [{ type: 'text', value: `🤖 Oops! ${errorMessage}` }] } } }]);
          handleStop(false); // Auto-stop, not user initiated
          return;
        }
        
        // We don't expect session_id or command_exec here, just reply chunks
        if (parsedData.type === 'text_chunk') {
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

        } else if (parsedData.type === 'final') {
          // Similar to the above, we just finalize the state here.
          // The AI's response to the tool output has been streamed and displayed.
          // We add the final action object to the history so the conversation flow is saved.
          setHistory(prev => [...prev, { role: 'model', content: parsedData.payload }]);
          setModelResponse(null);
          setIsLoading(false);
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
        }
      } catch (error) {
        console.error("Failed to parse message data", error);
      }
    };
    
    eventSourceRef.current.onerror = (err) => {
      console.error("EventSource failed:", err);
      setIsLoading(false);
      eventSourceRef.current.close();
      setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { text: "Sorry, an error occurred with the stream." } } }]);
    };
  };

  const handleNewConversation = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
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
                {isLoading ? (
                  <button type="button" onClick={() => handleStop(true)} className="stop-button">Stop</button>
                ) : (
                  <button type="submit" disabled={isLoading}>Send</button>
                )}
            </form>
        </main>
    </div>
  );
}

export default App;
