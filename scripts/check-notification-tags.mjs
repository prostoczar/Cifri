// Does what we tell OneSignal match what the app itself believes?
//
// The notification sender knows no game rules. It compares timestamps this app publishes, so a
// wrong timestamp is a wrong notification, and every way of being wrong here is quiet: a streak
// warning on the evening a streak is already dead, or silence on the evening it is about to die.
// Nothing throws either way.
//
// The important test is the last one. It takes the deadline the tags CLAIM and the verdict the
// real reducer REACHES, and insists they agree for every gap length — which is the only way to
// know the two have not drifted apart. It drives the real reducer and the real tag builder rather
// than a copy of either.
//
// Run it with:  npm run check:notify

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { notificationTags } = await server.ssrLoadModule('/src/lib/notificationTags.js');

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const key = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
const today = key(new Date());
const now = Date.now();

let failures = 0;
function check(name, cond, detail) {
  if (cond) return;
  failures++;
  console.error('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
}

// A player who last played `gap` days ago, carrying `streak` days at that point.
function playedDaysAgo(gap, streak) {
  const d = ago(gap);
  return {
    ...defaultState(),
    db: {
      easy: { sessions: [{ date: d, score: 510, real: true }], best: 510, lastDay: d },
      medium: { sessions: [], best: 0, lastDay: null },
      hard: { sessions: [], best: 0, lastDay: null },
    },
    brState: { sessions: [], lastDay: null, bestTime: null, bestAge: null },
    streak,
    streakCreditedForDay: d,
    streakLastCheckedDay: d,
    bestStreakEver: streak,
    username: 'ada',
  };
}

console.log('\nnotification tags\n');

// ── 1. Today banked, or not ───────────────────────────────────────────────────────────────────
// `credited_until_ms` is what the plain daily reminder turns on: at or past it, today is unplayed.
{
  const playedToday = notificationTags(playedDaysAgo(0, 3));
  check('played today → today counts as banked', playedToday.credited_until_ms > now,
    'credited_until_ms=' + playedToday.credited_until_ms + ' now=' + now);

  const playedYesterday = notificationTags(playedDaysAgo(1, 3));
  check('played yesterday → today is not banked', playedYesterday.credited_until_ms <= now);

  const neverPlayed = notificationTags(defaultState());
  check('never played → nothing banked', neverPlayed.credited_until_ms === 0);
  check('never played → no streak deadline', neverPlayed.streak_deadline_ms === 0);
}

// ── 2. A streak of zero has no deadline ───────────────────────────────────────────────────────
// Someone whose streak already broke must not be told a streak is about to break.
{
  const t = notificationTags({ ...playedDaysAgo(1, 0), streak: 0 });
  check('streak 0 → no deadline to warn about', t.streak_deadline_ms === 0);
}

// ── 3. The Braining boost ─────────────────────────────────────────────────────────────────────
{
  const withBoost = notificationTags({ ...playedDaysAgo(0, 3), brBoostDay: today });
  check('unspent boost today → expiry in the future', withBoost.boost_expires_ms > now);

  const staleBoost = notificationTags({ ...playedDaysAgo(1, 3), brBoostDay: ago(1) });
  check('boost from a past day → not advertised', staleBoost.boost_expires_ms === 0);

  const spent = notificationTags({ ...playedDaysAgo(0, 3), brBoostDay: null });
  check('spent boost → not advertised', spent.boost_expires_ms === 0);
}

// ── 4. The restore offer ──────────────────────────────────────────────────────────────────────
// Only worth a notification when it can actually be taken.
{
  const brokenAtMs = now - 3600 * 1000;
  const offered = notificationTags({
    ...defaultState(),
    pendingRestore: { brokenValue: 9, brokenAtMs, availableAtBreak: true },
  });
  check('live restore offer → expires 24h after the break',
    offered.restore_expires_ms === brokenAtMs + 24 * 3600 * 1000);
  check('live restore offer → still in the future', offered.restore_expires_ms > now);

  const alreadyUsed = notificationTags({
    ...defaultState(),
    pendingRestore: { brokenValue: 9, brokenAtMs, availableAtBreak: false },
  });
  check('restore already spent → nothing to hurry towards', alreadyUsed.restore_expires_ms === 0);
}

// ── 5. Saved data written before these fields existed ─────────────────────────────────────────
// Loading does `Object.assign(base, parsed)`, so a `settings` from an older build arrives with no
// `notif` at all. Every reader must tolerate that; this one has a default to fall back to.
{
  const old = { ...defaultState(), settings: { sound: true, dark: null, fontSize: 'medium', lang: null } };
  const t = notificationTags(old);
  check('missing settings.notif → default hour', t.remind_hour === 19);
  check('missing settings.notif → reminders off', t.reminders === '0');
  check('missing lang → defaults to English', t.lang === 'en');

  const noSettings = notificationTags({ ...defaultState(), settings: undefined });
  check('settings absent entirely → still produces tags', noSettings.remind_hour === 19);
}

// ── 6. Nothing identifying leaves the device ──────────────────────────────────────────────────
// OneSignal delivers notifications; it is not somewhere a player's work is kept. An allowlist
// rather than a spot check, so a field added later has to be considered rather than just ride along.
{
  const ALLOWED = [
    'streak', 'credited_until_ms', 'streak_deadline_ms', 'boost_expires_ms',
    'restore_expires_ms', 'remind_hour', 'reminders', 'lang', 'nudge_utc_hour',
  ];
  const state = {
    ...playedDaysAgo(0, 5),
    username: 'ada',
    acctData: { email: 'ada@example.com', fullName: 'Ada Lovelace' },
  };
  const t = notificationTags(state);
  const unexpected = Object.keys(t).filter((k) => ALLOWED.indexOf(k) === -1);
  check('no tag outside the allowlist', unexpected.length === 0, 'unexpected: ' + unexpected.join(', '));

  const serialised = JSON.stringify(t).toLowerCase();
  for (const secret of ['ada', 'lovelace', 'example.com']) {
    check('no personal data in tags (' + secret + ')', serialised.indexOf(secret) === -1);
  }
}

// ── 7. THE ONE THAT MATTERS ───────────────────────────────────────────────────────────────────
//
// The deadline the tags publish and the verdict the reducer reaches have to be the same fact. If
// they drift, notifications go out about streaks that are already gone, or fail to go out on the
// last evening a streak could have been saved — and nothing anywhere throws.
//
// For each gap: what would the device have published, and what does the real reducer decide?
{
  for (let gap = 0; gap <= 4; gap++) {
    const before = playedDaysAgo(gap, 5);
    const tags = notificationTags(before);
    const after = reducer(before, { type: 'CHECK_STREAK_BREAK' });

    const tagsSayAlive = tags.streak_deadline_ms > now;
    const reducerSaysAlive = after.streak > 0;

    check(
      'gap ' + gap + 'd: tag deadline agrees with the reducer',
      tagsSayAlive === reducerSaysAlive,
      'tags say ' + (tagsSayAlive ? 'alive' : 'dead') +
        ', reducer says ' + (reducerSaysAlive ? 'alive' : 'dead') +
        ' (deadline=' + new Date(tags.streak_deadline_ms).toISOString() + ')'
    );

    // And once it has actually broken, the tags must stop advertising a deadline at all — the
    // device republishes after the break check, and a stale deadline would keep warning about a
    // streak that no longer exists.
    if (!reducerSaysAlive) {
      check('gap ' + gap + 'd: after the break, no deadline is published',
        notificationTags(after).streak_deadline_ms === 0);
    }
  }
}

// ── 8. The reminder hour survives the trip into UTC ───────────────────────────────────────────
// The sender filters on `nudge_utc_hour`, so if this conversion is wrong every reminder arrives at
// the wrong time — and it arrives reliably, which is what makes it hard to notice.
{
  for (const h of [7, 12, 19, 22]) {
    const t = notificationTags({
      ...defaultState(),
      settings: { sound: true, dark: null, fontSize: 'medium', lang: 'en', notif: { enabled: true, hour: h } },
    });
    check('hour ' + h + ' → a real UTC hour',
      Number.isInteger(t.nudge_utc_hour) && t.nudge_utc_hour >= 0 && t.nudge_utc_hour <= 23,
      'got ' + t.nudge_utc_hour);
    check('hour ' + h + ' → the local hour is still carried unchanged', t.remind_hour === h);

    // Converting back must land on the hour the player actually chose. Done against a real Date
    // rather than by subtracting an offset, so a half-hour timezone cannot quietly pass.
    const probe = new Date();
    probe.setHours(h, 0, 0, 0);
    check('hour ' + h + ' → round-trips through UTC', probe.getUTCHours() === t.nudge_utc_hour);
  }
}

// ── 9. The property the send filters are built on ─────────────────────────────────────────────
//
// The four notification kinds are made mutually exclusive using plain AND filters, with no OR
// grouping, and that only works because of one thing: when today is NOT banked, a live streak
// always has a deadline in the future, and a dead or absent streak always has a deadline of 0.
//
// That is what lets "daily reminder" be expressed as `streak_deadline_ms < now` — meaning "not
// at risk" — instead of a negated range OneSignal cannot express. If it ever stops holding, the
// plain reminder and the streak warning both fire and a player gets two notifications in an
// evening. Asserted here because nothing else would notice.
{
  for (const gap of [1, 2, 3]) {
    const s = reducer(playedDaysAgo(gap, 5), { type: 'CHECK_STREAK_BREAK' });
    const t = notificationTags(s);
    if (t.credited_until_ms !== 0 && t.credited_until_ms < now) {
      const alive = s.streak > 0;
      check(
        'gap ' + gap + 'd: today unbanked → deadline is future iff the streak lives',
        alive ? t.streak_deadline_ms > now : t.streak_deadline_ms === 0,
        'streak=' + s.streak + ' deadline=' + t.streak_deadline_ms
      );
      // Restated as the sender sees it: exactly one of the two conditions can be true.
      const matchesDaily = t.streak_deadline_ms < now;
      const matchesAtRisk = t.streak_deadline_ms > now && t.streak_deadline_ms < now + 24 * 3600 * 1000;
      check('gap ' + gap + 'd: daily and at-risk cannot both match', matchesDaily !== matchesAtRisk);
    }
  }
}

await server.close();

if (failures) {
  console.error('\n' + failures + ' failure(s)\n');
  process.exit(1);
}
console.log('  all checks passed\n');
