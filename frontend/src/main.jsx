import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ✅ Senza StrictMode in sviluppo per evitare double-fire di useEffect/socket
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);