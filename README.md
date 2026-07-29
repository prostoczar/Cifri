# Cifri

Daily math. Sharper mind.

A mobile mental-arithmetic trainer: a timed daily Challenge, a Braining brain-age test, custom
Practice drills, and a library of mental-maths Tricks, tied together by a shared daily streak.

## Branches

| Branch | What it is |
|---|---|
| `main` | The original single-file prototype. Serves the live site at trycifri.com. |
| `react-rewrite` | The React rewrite. This branch. |

## Running it

```bash
npm install
npm run dev             # http://localhost:5173
npm run dev -- --host   # also reachable from a phone on the same network
```

Other commands:

```bash
npm run build     # production build into dist/
npm run preview   # serve that build locally
npm run lint      # oxlint
```

## Layout

```
src/
  App.jsx            screen/tab routing, overlays, session wiring
  index.css          the whole design system, ported verbatim
  i18n_data.js       every UI string, English and Russian
  store/             game logic and persisted state (no React inside)
  hooks/             game loops and gestures
  screens/           full screens
  components/        shared pieces
reference/
  original-prototype.html    the v18.3 prototype this was ported from
```

State lives in one reducer (`store/AppStateContext.jsx`) and persists to `localStorage`.

## Accounts are mocked

Onboarding, sign-up, login, password reset, edit account, log out and delete account are all
built and behave like the real thing, but they are **local only** — no Supabase call, no network
request, no authentication. `store/mockAccounts.js` holds the stand-in data.

`lib/supabaseClient.js` creates a client and nothing imports it yet, so it is tree-shaken out of
the production bundle. Real auth wiring is a separate piece of work.

## The reference prototype

`reference/original-prototype.html` is the complete, tested prototype the rewrite was ported
from — it is the source of truth for behaviour, copy and styling. The port was checked against it
rule by rule: identical design tokens, identical CSS, identical UI strings in both languages, and
matching game logic.

Two intentional differences:

- **Practice mode honours its own settings.** In the prototype the operation, digit, term,
  negative and decimal choices had no effect on the questions generated — a bug. The rewrite has
  a separate parameter-driven generator (`store/practiceEngine.js`).
- **Tab switching** wraps around and animates differently, following later design feedback.
