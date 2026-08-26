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
// English phone, which is a normal thing to do. So each send is filtered on our own `w` tag (which
// carries the language) and carries its text in OneSignal's required `en` slot regardless of which
// language it actually is. Every recipient of a given send has already been narrowed to one
// language, so the slot is only a container and its name means nothing here.
//
// ── Why there is only one message ─────────────────────────────────────────────────────────────
//
// There used to be four (restore, boost, streak, daily), each needing its own tag to know when it
// applied. The OneSignal plan this app is on rejects a tag write outright once a user holds more
// tags than the plan allows, and those four kinds were most of what pushed the tag count past it —
// see the notifications memory. One nudge, needing only two tags, is what actually ships.
//
// Deliberately no streak number in the text, and no per-situation wording. OneSignal can substitute
// a tag into a message, but nothing in `npm run check` can prove the substitution renders, and the
// failure mode is the raw template arriving on a player's lock screen.

// The Russian uses informal «ты», matching the rest of the app.
export const NOTIFICATION_COPY = {
  en: { title: 'Sharpen your mind today', body: 'One math game a day paves the way' },
  ru: { title: 'Наточи свой ум сегодня', body: 'Пара минут в Cifri — и день не прошёл зря' },
};

export const LANGS = ['en', 'ru'];
