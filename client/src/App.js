import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modelResponse, setModelResponse] = useState(''); // For streaming response
  const chatWindowRef = useRef(null);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [history, modelResponse]);

  const executeTurn = async () => {
    if (!prompt.trim()) return;

    const currentPromptText = prompt;
    setHistory(prev => [...prev, { role: 'user', content: currentPromptText }]);
    setPrompt('');
    setIsLoading(true);
    setModelResponse('');

    const url = `http://localhost:3001/gemini/conversation-stream?message=${encodeURIComponent(currentPromptText)}`;
    const eventSource = new EventSource(url);
    let streamingText = '';

    eventSource.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        if (parsedData.type === 'chunk') {
          streamingText += parsedData.payload;
          setModelResponse(streamingText);
        } else if (parsedData.type === 'final') {
          const finalAction = parsedData.payload;
          setHistory(prev => [...prev, { role: 'model', content: finalAction }]);
          setModelResponse('');
          setIsLoading(false);
          eventSource.close();
        }
      } catch (error) {
        console.error("Failed to parse message data", error);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      setIsLoading(false);
      eventSource.close();
      setHistory(prev => [...prev, { role: 'model', content: { action: 'reply', parameters: { text: "Sorry, an error occurred with the stream." } } }]);
    };
  };

  const handlePromptChange = (e) => {
    setPrompt(e.target.value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeTurn();
  };

  const renderTurn = (turnContent, index) => {
    const { action, parameters } = turnContent;

    // Handle cases where content might be malformed
    if (!action || !parameters) {
      const message = typeof turnContent === 'string' ? turnContent : JSON.stringify(turnContent);
      return <p>{message}</p>;
    }

    // If the action is a simple reply, just show the text.
    if (action === 'reply') {
      return <p>{parameters.text}</p>;
    }

    // For other actions, display the action details
    return (
      <div key={index} className="turn">
        <div className="action-request">
          <strong>Action:</strong> {action}
          <pre>{JSON.stringify(parameters, null, 2)}</pre>
        </div>
        <div className="action-result">
          {/* The result part is not yet implemented in the streaming flow */}
          <p>Action acknowledged. Result would appear here.</p>
        </div>
      </div>
    );
  };
  
  return (
    <div className="App">
      <header className="App-header">
        <h1>Deskina AI Agent</h1>
      </header>
      <div className="chat-window" ref={chatWindowRef}>
        {history.map((item, index) => {
            switch (item.role) {
                case 'user':
                    return <div key={index} className="message user"><p>{item.content}</p></div>;
                case 'model':
                    return <div key={index} className="message model">{renderTurn(item.content, index)}</div>;
                case 'system':
                    return <div key={index} className="system-message">{item.content}</div>;
                default:
                    return null;
            }
        })}
        {isLoading && <div className="loading-indicator">Thinking...</div>}
        {modelResponse && <div className="message model"><p>{modelResponse}</p></div>}
      </div>
      <form onSubmit={handleSubmit} className="message-form">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={isLoading ? "Working..." : "Ask Deskina to do something..."}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}

export default App;
