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

export const NOTIFICATION_COPY = {
  // A streak that broke and can still be brought back, with the 24-hour offer running out.
  // Ranked above everything else because it is the only one that is genuinely last-chance: the
  // others come round again tomorrow, this does not.
  restore: {
    en: { title: 'Your streak can still come back', body: 'The restore offer runs out tonight.' },
    ru: { title: 'Серию ещё можно вернуть', body: 'Предложение восстановления истекает сегодня.' },
  },
  // An unspent Braining boost. The one nobody else could send: it is specific to something the
  // player earned today and loses at midnight. Fires in a gap the others cannot, because finishing
  // Braining already banked the day, which silences both streak messages below.
  boost: {
    en: { title: 'Your boost expires tonight', body: 'You earned a Challenge boost in Braining today — spend it before midnight.' },
    ru: { title: 'Бонус сгорит сегодня', body: 'Вы заработали бонус к Челленджу за Брейнинг — используйте его до полуночи.' },
  },
  // A live streak that dies at local midnight unless something is played today.
  streak: {
    en: { title: 'Your streak ends at midnight', body: 'One round of Challenge or Braining keeps it alive.' },
    ru: { title: 'Серия прервётся в полночь', body: 'Один раунд Челленджа или Брейнинга сохранит её.' },
  },
  // The plain nudge, for everyone with no streak on the line.
  daily: {
    en: { title: 'Time to train', body: "Today's Cifri hasn't happened yet." },
    ru: { title: 'Пора заниматься', body: 'Вы сегодня ещё не занимались в Cifri.' },
  },
};

// The order a player's situation is resolved in, most urgent first. Also the order the sender must
// dispatch in, because each kind's filter excludes the ones above it.
export const NUDGE_ORDER = ['restore', 'boost', 'streak', 'daily'];

export const LANGS = ['en', 'ru'];
