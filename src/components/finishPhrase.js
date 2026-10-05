// Which motivating phrase the Finish screen shows. Its own file because App.jsx picks the phrase
// when it builds the Finish screen's data, and a component file that also exports helpers loses
// React's fast refresh.
//
// Picked by App rather than inside the component so it happens exactly once per finish: React's
// StrictMode runs component initialisers twice in development, which would pick two phrases and
// remember the one that was not shown.

// ── Phrases ──────────────────────────────────────────────────────────────────────────────────

const PHRASE_KEYS = Array.from({ length: 13 }, (_, i) => 'finish_p' + (i + 1));
const LAST_PHRASE_KEY = 'cifri_finish_last_phrase';

// "Never show the same phrase twice in a row." Remembered in its own localStorage key rather than
// in app state, because it is cosmetic: it is deliberately not in SYNCED_KEYS (a phone does not
// need to know what phrase the laptop showed), and a failed read or write costs at worst one
// repeated phrase — which is why, unlike the game-state write, it is allowed to fail quietly.
// A per-session variable would have been simpler but useless: most people play once a day, so the
// app has usually been reloaded between two finishes and the memory would always be empty.
export function pickFinishPhrase(isBest) {
  if (isBest) return 'finish_best';
  let last = null;
  try { last = localStorage.getItem(LAST_PHRASE_KEY); } catch { /* cosmetic */ }
  const pool = PHRASE_KEYS.filter((k) => k !== last);
  // Math.random is fine here: this is not the seeded question generator, and nothing on the
  // server has to agree with which phrase a player saw.
  const key = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem(LAST_PHRASE_KEY, key); } catch { /* cosmetic */ }
  return key;
}
