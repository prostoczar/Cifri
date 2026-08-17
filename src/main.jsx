import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initAnalytics } from './lib/analytics.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// AFTER the render call, and deliberately not awaited.
//
// It used to be the line above this one, so that the load pageview and anything captured during
// startup were not lost. That is still the requirement, and it is now met a different way:
// initAnalytics defers its own `import('posthog-js')` until after first paint and QUEUES anything
// captured in the meantime, replaying it in order once the module lands. Nothing is dropped; only the
// network request moves. See the header of lib/analytics.js for what does change.
//
// The reason for moving it is 78 kB gzipped — 29% of the bundle, measured — sitting on the critical
// path of every cold load on a phone. Safe to call unconditionally: with no keys configured it does
// nothing at all.
initAnalytics()
