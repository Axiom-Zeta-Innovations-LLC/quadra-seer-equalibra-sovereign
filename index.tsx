
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  // Prevent stale SW caches from masking local UI changes.
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    })
    .catch((error) => {
      console.warn('Failed to clear service workers in development:', error);
    });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Catastrophic mount failure:", error);
  rootElement.innerHTML = `<div style="color: red; padding: 20px; font-family: monospace;">
    <h1>System Initialization Error</h1>
    <p>${error instanceof Error ? error.message : String(error)}</p>
  </div>`;
}
