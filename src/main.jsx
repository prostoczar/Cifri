import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initAnalytics } from './lib/analytics.js'
import { initNativeShell } from './lib/nativeShell.js'

// Still called before the first render, but it no longer loads posthog here — it schedules the
// SDK's own chunk for just after the first paint and buffers anything captured in the meantime,
// so startup events keep their real timestamps without ~80 kB gzipped standing between the
// player and the first question. See lib/analytics.js for why that is safe.
// Safe to call unconditionally: with no keys configured it does nothing at all.
initAnalytics()

// Status bar and keyboard details the native wrapper needs told. A no-op in a browser, and it
// imports nothing there, so the web bundle is unchanged by it.
initNativeShell()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
