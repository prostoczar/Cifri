import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { I18N } from './src/i18n_data.js'

// The launch animation (index.html) runs before the app's code has loaded — that is its whole job,
// it covers the loading — so it cannot ask the translation table for its one line of copy. Rather
// than keep a second copy of that line in the page, it is written in here from src/i18n_data.js
// whenever the page is served or built, and the table stays the only place the words live.
function launchStrings() {
  return {
    name: 'cifri-launch-strings',
    transformIndexHtml(html) {
      const strings = { en: I18N.en.launch_slow, ru: I18N.ru.launch_slow }
      return html.replace('__CIFRI_LAUNCH_STRINGS__', JSON.stringify(strings))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), launchStrings()],
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
