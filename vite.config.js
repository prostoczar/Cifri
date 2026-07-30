import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on every network interface so a phone on the same Wi-Fi can reach the dev server.
    host: true,
    // Vite blocks requests whose Host header it does not recognise. Allowing the Mac's .local
    // name gives phone testing one stable address instead of an IP that changes with every
    // network — see the README for the caveat about networks that block device-to-device
    // traffic, where no address will work.
    allowedHosts: ['.local'],
  },
})
