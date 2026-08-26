// Does what we tell OneSignal match what the app itself believes?
//
// The notification sender knows no game rules. It compares two tags this app publishes, so a
// wrong tag is a wrong (or missing) notification, and every way of being wrong here is quiet: a
// nudge on a day already played, or silence on a day that was not. Nothing throws either way.
//
// Run it with:  npm run check:notify

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { notificationTags } = await server.ssrLoadModule('/src/lib/notificationTags.js');

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const key = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
const now = Date.now();

let failures = 0;
function check(name, cond, detail) {
  if (cond) return;
  failures++;
  console.error('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
}

// A player who last played `gap` days ago.
function playedDaysAgo(gap) {
  const d = ago(gap);
  return {
    ...defaultState(),
    db: {
      easy: { sessions: [{ date: d, score: 510, real: true }], best: 510, lastDay: d },
      medium: { sessions: [], best: 0, lastDay: null },
      hard: { sessions: [], best: 0, lastDay: null },
    },
    brState: { sessions: [], lastDay: null, bestTime: null, bestAge: null },
    streakCreditedForDay: d,
    streakLastCheckedDay: d,
    username: 'ada',
  };
}

function withNotif(state, notif, lang) {
  return { ...state, settings: { ...(state.settings || {}), notif, lang } };
}

console.log('\nnotification tags\n');

// ── 1. `c` — has today been banked? ───────────────────────────────────────────────────────────
// `now >= c` means today is not banked, which is the condition the nudge fires on.
{
  const playedToday = notificationTags(playedDaysAgo(0));
  check('played today → c is in the future (banked)', playedToday.c > now,
    'c=' + playedToday.c + ' now=' + now);

  const playedYesterday = notificationTags(playedDaysAgo(1));
  check('played yesterday → c is in the past (not banked)', playedYesterday.c <= now);

  const neverPlayed = notificationTags(defaultState());
  check('never played → c is 0 (not banked)', neverPlayed.c === 0);
}

// ── 2. `w` — off when reminders are off, packed hour+lang when they are on ───────────────────
{
  const off = notificationTags(withNotif(defaultState(), { enabled: false, hour: 19 }, 'en'));
  check('reminders off → w is empty (OneSignal deletes the tag)', off.w === '');

  const on = notificationTags(withNotif(defaultState(), { enabled: true, hour: 19 }, 'en'));
  check('reminders on → w is not empty', on.w !== '');

  const defaultNotifState = notificationTags(defaultState());
  check('default state has reminders off → w is empty', defaultNotifState.w === '');
}

// ── 3. `w` round-trips the chosen local hour and language ────────────────────────────────────
// The sender filters on an exact match of `w`, so if this packing is wrong every reminder either
// never matches or arrives at the wrong time — and it does so reliably, which is what makes it
// hard to notice.
{
  for (const h of [0, 7, 12, 19, 22, 23]) {
    for (const lang of ['en', 'ru']) {
      const t = notificationTags(withNotif(defaultState(), { enabled: true, hour: h }, lang));

      const probe = new Date();
      probe.setHours(h, 0, 0, 0);
      const expectedUtcHour = probe.getUTCHours();

      check('hour ' + h + ' lang ' + lang + ' → w carries the UTC hour and language',
        t.w === String(expectedUtcHour) + lang,
        'got ' + JSON.stringify(t.w) + ' expected ' + JSON.stringify(String(expectedUtcHour) + lang));
    }
  }
}

// ── 4. Saved data written before these fields existed ─────────────────────────────────────────
// Loading does `Object.assign(base, parsed)`, so a `settings` from an older build arrives with no
// `notif` at all. Every reader must tolerate that; this one has a default to fall back to.
{
  const old = { ...defaultState(), settings: { sound: true, dark: null, fontSize: 'medium', lang: null } };
  const t = notificationTags(old);
  check('missing settings.notif → reminders read as off', t.w === '');

  const noSettings = notificationTags({ ...defaultState(), settings: undefined });
  check('settings absent entirely → still produces tags without throwing', noSettings.w === '' && noSettings.c === 0);
}

// ── 5. Nothing identifying leaves the device, and nothing beyond the two tags ────────────────
// An allowlist rather than a spot check, so a field added later has to be considered rather than
// just ride along.
{
  const ALLOWED = ['w', 'c'];
  const state = withNotif({
    ...playedDaysAgo(0),
    username: 'ada',
    acctData: { email: 'ada@example.com', fullName: 'Ada Lovelace' },
  }, { enabled: true, hour: 15 }, 'en');
  const t = notificationTags(state);
  const unexpected = Object.keys(t).filter((k) => ALLOWED.indexOf(k) === -1);
  check('no tag outside the allowlist', unexpected.length === 0, 'unexpected: ' + unexpected.join(', '));

  const serialised = JSON.stringify(t).toLowerCase();
  for (const secret of ['ada', 'lovelace', 'example.com']) {
    check('no personal data in tags (' + secret + ')', serialised.indexOf(secret) === -1);
  }
}

await server.close();

if (failures) {
  console.error('\n' + failures + ' failure(s)\n');
  process.exit(1);
}
console.log('  all checks passed\n');
