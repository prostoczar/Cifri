// What each notification actually says, in both languages.
//
// ── Why this is not in src/i18n_data.js ───────────────────────────────────────────────────────
//
// CLAUDE.md's rule is that every user-facing string lives in i18n_data.js, with the achievement
// catalogue as the one deliberate exception. This is the second, and for a plainer reason than the
// first: these strings are never rendered by the app. They are rendered by an Edge Function, on a
// day the player may not have opened Cifri at all. Deno bundles only what sits beneath
// `supabase/functions/`, which is the same constraint that moved the scoring maths down here.
//
// Everything the app itself shows about reminders — the settings row, the opt-in card, the install
// instructions — is still in i18n_data.js where it belongs. Only the notification bodies are here.
//
// ── Why the text is duplicated into `en` rather than using OneSignal's own language handling ──
//
// OneSignal picks a language per subscriber from the BROWSER, and Cifri's language is a setting a
// player chooses in the app — the two disagree the moment somebody runs the Russian interface on an
// English phone, which is a normal thing to do. So each send is filtered on our own `lang` tag and
// carries its text in OneSignal's required `en` slot regardless of which language it actually is.
// Every recipient of a given send has already been narrowed to one language, so the slot is only a
// container and its name means nothing here.
//
// Deliberately no streak number in the text. OneSignal can substitute a tag into a message, but
// nothing in `npm run check` can prove the substitution renders, and the failure mode is the raw
// template arriving on a player's lock screen. Worth adding once it has been seen working once.

// Read from the scoring module rather than typed into the copy. The boost percentage is a game
// number that lives in exactly one place, and a notification promising +5% after someone changed
// the constant would be the app lying about its own rules on a player's lock screen.
import { BRAINING_BOOST_PCT } from './scoring.js';

const PCT = '+' + BRAINING_BOOST_PCT + '%';

// The Russian throughout uses informal «ты», matching the rest of the app.
export const NOTIFICATION_COPY = {
  // A streak that broke and can still be brought back, with the 24-hour offer running out.
  // Ranked above everything else because it is the only one that is genuinely last-chance: the
  // others come round again tomorrow, this does not.
  restore: {
    en: { title: "Your flame hasn't gone out yet", body: 'Solve a few equations to relight it' },
    ru: { title: 'Огонёк ещё не погас', body: 'Реши пару примеров — он снова разгорится' },
  },
  // An unspent Braining boost. The one nobody else could send: it is specific to something the
  // player earned today and loses at midnight. Fires in a gap the others cannot, because finishing
  // Braining already banked the day, which silences both streak messages below.
  boost: {
    en: { title: "Don't let your boost fade", body: "You've got " + PCT + ' on Challenge — use it by midnight' },
    ru: { title: 'Не дай бонусу сгореть', body: PCT + ' к Челленджу ждут — используй до полуночи' },
  },
  // A live streak that dies at local midnight unless something is played today.
  streak: {
    en: { title: "Don't let your flame go out", body: 'One round of Challenge or Braining keeps it burning' },
    ru: { title: 'Не дай огню погаснуть', body: 'Один раунд Челленджа или Брейнинга — и серия жива' },
  },
  // The plain nudge, for everyone with no streak on the line.
  daily: {
    en: { title: 'Sharpen your mind today', body: 'One math game a day paves the way' },
    ru: { title: 'Наточи свой ум сегодня', body: 'Пара минут в Cifri — и день не прошёл зря' },
  },
};

// The order a player's situation is resolved in, most urgent first. Also the order the sender must
// dispatch in, because each kind's filter excludes the ones above it.
export const NUDGE_ORDER = ['restore', 'boost', 'streak', 'daily'];

export const LANGS = ['en', 'ru'];
