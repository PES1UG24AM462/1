import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App';

// Block all API calls from an accidentally HTTP-hosted production page.
axios.interceptors.request.use((config) => {
  if (process.env.NODE_ENV === 'production' && window.location.protocol !== 'https:') {
    throw new Error('HTTPS is required for SAMS API traffic.');
  }
  return config;
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
