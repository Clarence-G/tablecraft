import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';
import { initAnalytics } from './lib/analytics';
import { Sentry, initSentry } from './lib/sentry';

initSentry();
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Sentry.ErrorBoundary fallback={<div>Something went wrong</div>}>
        <App />
      </Sentry.ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
