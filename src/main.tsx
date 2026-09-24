import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallbackTitle="Jaygo AU 客户端遇到未捕获异常">
    <App />
  </ErrorBoundary>
);

