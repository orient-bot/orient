import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { FeatureFlagsProvider } from './context/FeatureFlagsContext';
import './index.css';

// Determine basename based on how the app is accessed:
// - If accessed via /dashboard/*, use /dashboard basename
// - If accessed via root /, use / basename (production nginx serves at root)
const isAccessedAtDashboardPath = window.location.pathname.startsWith('/dashboard');
const runtimeBase = isAccessedAtDashboardPath ? '/dashboard' : '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={runtimeBase || '/'}>
      <FeatureFlagsProvider>
        <App />
      </FeatureFlagsProvider>
    </BrowserRouter>
  </React.StrictMode>
);
