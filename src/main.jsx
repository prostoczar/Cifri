import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initAnalytics } from './lib/analytics.js'

// Before the first render, so the load pageview and anything captured during startup are not
// lost. Safe to call unconditionally: with no keys configured it does nothing at all.
initAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
