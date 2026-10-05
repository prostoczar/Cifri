# Cifri — Game Finish Animation Spec

Oct 5, 2026 · @Bogdan Maximov

## Overview

A full-screen **Finish screen** now sits between the end of a counted game and the existing result screen, for both Challenge and Braining. It replaces today's hard cut. Header, bottom nav and all other UI are hidden while it is on screen. The result screens themselves are unchanged.

**What it does, in one line:** a motivating phrase, then the score ring fills against your best, the streak flame catches light and keeps burning, and a tap carries the score and flame into the result screen.

**Scope.** Challenge finish and Braining finish only. App launch animation is a separate, later spec.

**Locked visual rules (do not change).**

- Nunito, weight 900, on every piece of text in this feature.
- Brand colors only: green `#0f9d6c`, yellow `#ffd166`, terracotta `#d65a3a`, beige `#fdf8f3`.
- Shadows are solid bottom-offset (`0 2px 0` / `0 3px 0`), never blurred.
- No neumorphism, no gradients on surfaces. The only gradient is inside the burning flame icon.

**Code this touches (branch `react-rewrite`).**

| File | Why |
| --- | --- |
| `src/App.jsx` | Today `setScreen('result')` (after `setResultData`) and `setScreen('br-result')` (after `setBrResultData`) cut straight to results. Insert the Finish screen before these. Header is rendered unconditionally here and must be hidden while the Finish screen shows. |
| new `src/components/FinishScreen.jsx` | The Finish screen itself, shared by both modes. |
| `src/index.css` | New keyframes and classes, plus a `prefers-reduced-motion` block. None exists in the app today. |
| `src/store/sound.js` | New sound functions, written in the same Web Audio style as `tick`, `buzz` and `cdTone`. |
| new `src/lib/haptics.js` | Thin wrapper around `@capacitor/haptics` (new dependency). Does nothing on web. |
| `src/store/AppStateContext.jsx` | Braining needs a new best-brain-age flag (see Braining differences). |
| `src/store/avatar.js` | Source of the flame icon path (the `flame` entry), reused for the big flame. |
| `src/screens/ChallengeResultScreen.jsx`, `src/screens/BrainingResultScreen.jsx` | Delay the achievement popup queue until results have finished entering. |
| i18n files (en, ru) | 14 new phrase keys plus the tap prompt. |

**How to read this spec.** Times are in milliseconds from the moment the timer hits zero (Challenge) or the last answer is submitted (Braining). "Easing" names are defined once in the Visual elements section.

## Variants

Five variants exist. Two facts decide which plays: did this game change the streak flame, and was it a new best.

| Variant | When it plays | Flame pill ends | Background ends | Phrase |
| --- | --- | --- | --- | --- |
| **V1 First game** | First counted game of the day (either mode); flame goes grey → green | Green `#0f9d6c`, with shadow | Beige | Random |
| **V2 Second game** | Counted game that completes both modes today; flame goes green → gold | Gold `#ffd166`, shadow removed | Yellow (pill floods outward) | Random |
| **V3 New best** | V1 conditions + new best | Green, with shadow (stays) | Yellow (ring engulfs) | New-best phrase |
| **V4 New best + both games** | V2 conditions + new best | Gold, no shadow | Yellow (ring engulfs) | New-best phrase |
| **V5 Uncounted run** | A run that does not move the streak: Braining practice (`isPrac`), any replay of a mode already done today, future Challenge practice | Already in its current color, no lighting step | Beige | Random |
| **V5 + best** | A Challenge replay or a Braining retry (not practice) that sets a real new best | Already in its current color, no lighting step | Yellow (ring engulfs) | New-best phrase |

**Rules.**

- In V4 the ring engulf is the yellow moment. The gold pill does not also flood.
- Practice never celebrates a new best (existing app rule). A practice run is always plain V5: no ring-to-yellow and no new-best phrase.
- **A replay that sets a real new best does celebrate (decided 5 Oct 2026).** A Challenge replay, or a Braining retry after the day's trial, can beat the personal best, and the result screen already shows its "New personal best" ribbon for it. So the Finish screen agrees: V5 + best gets the ring-to-yellow, the engulf and the new-best phrase, while the flame stays exactly as it was, with no catching or lit step. Timeline: as V3 up to the engulf (2160 best, 2300 engulf, 2860 yellow layer), then the tap prompt at 3200.
- **First-ever game counts as a new best.** This matches today's code: Challenge `isNewBest = countedScore > prevBest` is true when there is no previous best, and the ring fills fully.
- "Counted game" and "new best" must use the same flags the result screens already use (`isNewBest` for Challenge; the new brain-age flag for Braining). Never recompute them inside the Finish screen.

## Header flame

Added 5 Oct 2026, after the Finish screen was built. The streak flame in the header pill now matches the Finish screen's.

- **Grey before any game today.** When no mode is done today, the header pill and its flame stay exactly as they were: grey pill, static outline flame.
- **Burning once a mode is done.** When Challenge or Braining (or both) is done today, the flame uses the Finish screen's Burning state: the wave, the upward-flowing white → yellow `#ffd166` → terracotta `#d65a3a` → white gradient (1600 ms loop), and the thin dark edge (`#0a5c40` on the green pill, `#7a5200` on the gold pill). Pill colours, shadows and rules do not change: green after one mode, gold after both.
- **Still during games.** While a game is actually being played (the countdowns, a Challenge or Practice-tab run, a Braining trial, a trick drill) the flame is lit, solid and motionless. It burns again on every other screen.
- **Reduced motion.** Lit and still, with its dark edge, with no wave and no colour flow. This is the same look the Finish screen's reduced-motion version ends on, so the hand-over into the header matches.
- **One flame.** Header and Finish screen both draw it with the shared `src/components/Flame.jsx`; there is no second copy. All flames on screen are locked to the same clock, so the flame pill flying into the header at the end of the Finish screen cross-fades into the header flame mid-flicker with no visible jump.
- **Cost.** Only a transform (the wave) and the gradient move. A paused or still flame mounts no animation at all. Measured on web: a steady 60 fps over a minute, no long tasks, no growth in memory or page size.

## Visual elements

The Finish screen has six elements, stacked top to bottom, horizontally centered. The base background is beige `#fdf8f3`. Reference sizes below are for a 288 px wide screen; scale with width and clamp so the ring never exceeds 300 px. Respect the top and bottom safe areas.

**1. Phrase pill.**

- Background yellow `#ffd166`, text `#4a3500`, Nunito 900, 24 px (19 px when longer than 16 characters).
- Padding 10 × 22 px, fully rounded, shadow `0 3px 0 #c49030`.
- Starts vertically centered, then glides to the top and settles at 72% scale. It stays there as the screen title.

**2. Flame pill.** A large copy of the header streak pill.

- Font 22 px, padding 10 × 20 px, gap 8 px, flame icon 30 px.
- Starts grey `#e9e3da`, text `#444`, no shadow, showing yesterday's streak number.
- Ends per variant: green with text and flame white plus shadow `0 3px 0 #0a7a54`, or gold with text and flame `#2b2b2b` and no shadow (on yellow).
- Streak number increments by 1 at the lit moment (V1–V4 only).

**3. Flame icon.** Same path as `avatar.js` `flame`, drawn in a 24 × 24 viewBox. Four states:

| State | Look |
| --- | --- |
| Unlit | Outline only, stroke `#9a9186`, width 2, no fill |
| Catching | Terracotta `#d65a3a` fill and stroke, revealed from the bottom up (clip-path `inset(100% 0 0 0)` to `inset(0)`) |
| Lit | Solid fill and stroke in the pill's text color (white on green, `#2b2b2b` on gold) |
| Burning (standby) | Same flame in both games: a vertical gradient white → yellow `#ffd166` → terracotta `#d65a3a` → white, repeating, flowing upward one full cycle every 1600 ms. Plus the wave (below). Plus a thin dark edge (below). |

- **Thin dark edge (option B).** Draw the flame path twice. The back copy has stroke and fill in a darker shade of the pill color, stroke width 4 (green pill `#0a5c40`, gold pill `#7a5200`). The front copy carries the gradient fill with stroke width 2. Result: a fine dark rim about 1 unit wide.
- **Wave.** Transform-origin bottom center, 1300 ms, infinite, ease-in-out. Keyframes: 0% `skewX(0) scaleY(1)`, 25% `skewX(-6deg) scaleY(1.07)`, 50% `skewX(4deg) scaleY(.96)`, 75% `skewX(-3deg) scaleY(1.04)`, 100% back to 0%.

**4. Score ring.**

- Diameter 230 px. SVG viewBox 110 × 110, circle radius 48, stroke width 7, round caps, starting at 12 o'clock and running clockwise.
- Track `#efe7dc`, arc green `#0f9d6c`.
- Inside: the score, 70 px, green, tabular numbers. Under it a 14 px label in `#7a7167`: "best {n}", or "new best!" on a new best.
- Fill amount = score ÷ personal best for this mode and difficulty, capped at 100%. A new best or a first-ever game fills to 100%.
- On a new best the arc turns yellow and the score turns `#2b2b2b`. Otherwise score and "Tap to continue" keep their colors even on yellow (decided).

**5. Tap prompt.** "Tap to continue", 15 px, `#7a7167`, bottom of screen. It pulses opacity between 0.2 and 1, 900 ms each way, forever.

**6. Yellow layer.** A full-screen `#ffd166` layer behind everything, covering the safe areas too. It is invisible until a V2 flood or a V3/V4 engulf.

**Easing names used in the timeline.**

| Name | Value | Feels like |
| --- | --- | --- |
| pop | keyframes scale 0 → 1.18 (60%) → 0.96 (80%) → 1, ease-out | springs in, overshoots, settles |
| glide | `cubic-bezier(.3,.7,.2,1)` | quick start, soft landing |
| fill | `cubic-bezier(.2,.7,.2,1)` | fast then slowing, like a gauge |
| grow | `cubic-bezier(.6,0,.3,1)` | slow start, swells, eases off |
| travel | `cubic-bezier(.5,0,.15,1)` | lifts off gently, flies, lands softly |
| drop | `cubic-bezier(.55,0,.8,.4)` | falls away, accelerating |

## Timeline

The tap prompt appears at 3400 ms in V1, 3800 ms in V2, 4000 ms in V3/V4 and 2400 ms in V5. Time 0 = timer hits zero (Challenge) or last Braining answer submitted. Rows are in time order.

| Time (ms) | Element | What happens | Duration | Easing | Variants |
| --- | --- | --- | --- | --- | --- |
| 0 | Game screen, header, bottom nav | Fade to opacity 0 together. Finish screen mounts underneath on beige. | 220 | linear | all |
| 200 | Phrase pill | Pops in at screen center with a random phrase (or the new-best phrase) | 480 | pop | all |
| 1050 | Phrase pill | Glides to the top, scales to 72% and stays | 420 | glide | all |
| 1300 | Flame pill | Fades in, unlit grey (V5: already lit and burning) | 220 | linear | all |
| 1300 | Score ring | Fades in from 90% to 100% scale | 260 | glide | all |
| 1300 | Ring arc + score | Arc fills to its share of best; score counts up 0 → final, ease-out-cubic on the count | 850 | fill | all |
| 2160 | Score ring | Lands with a small pulse: scale 1 → 1.06 → 1 | 240 | ease-out | all |
| 2160 | Ring arc, score, label | Arc color → yellow, score color → `#2b2b2b`, label → "new best!" | 300 | ease | V3, V4 |
| 2250 | Flame icon | Catching: terracotta rises from the bottom | 300 | glide | V1, V2 |
| 2300 | Ring arc | **Engulf:** stroke width 7 → 250 (grows inward and outward until it covers the screen). Track fades out in the first 200 ms. Phrase pill shadow fades out (300 ms). | 560 | grow | V3, V4 |
| 2600 | Flame pill + icon | **Lit:** pill color changes (200 ms ease), icon goes solid, streak number +1, pill pops: scale 1 → 1.3 (40%) → 0.94 (70%) → 1 | 480 | ease-out | V1, V2 |
| 2850 | Flame icon | Catching (shifted +600 ms so it follows the engulf) | 300 | glide | V3, V4 |
| 2860 | Yellow layer | Switched on at full screen; ring SVG hidden. Score and label stay. | 0 | none | V3, V4 |
| 3100 | Yellow layer | **Flood:** expands from the flame pill's center as a growing circle (clip-path circle 0 → 700 px+, enough to cover the screen). Pill shadow and phrase pill shadow fade out (250 ms). | 600 | grow | V2 |
| 3100 | Flame icon | Switches to Burning: gradient flow + wave + dark edge, forever | loop | — | V1, V2 |
| 3200 | Flame pill + icon | Lit, as at 2600. V4: gold with no shadow. V3: green keeps its shadow. | 480 | ease-out | V3, V4 |
| 3400 | Tap prompt | Fades in and starts pulsing; screen becomes tappable to continue | loop | ease-in-out | V1 |
| 3700 | Flame icon | Switches to Burning | loop | — | V3, V4 |
| 3800 | Tap prompt | Appears, as above | loop | ease-in-out | V2 |
| 4000 | Tap prompt | Appears, as above | loop | ease-in-out | V3, V4 |

**V5 (uncounted run)** runs the rows up to 2160 only (no catching, no lit, no yellow). The flame pill appears already lit and burning at 1300. The tap prompt appears at 2400.

## Interaction and the move into results

The whole screen is the tap target, and taps do different things by state.

| State | A tap does |
| --- | --- |
| First 400 ms after time 0 | Nothing. Players are mid-keypress when time runs out, so a stray tap must not skip the finish. |
| Animating | **Skip:** jump to the variant's final state immediately (pill at top, ring filled, flame lit and burning, yellow layer on if V2–V4, tap prompt pulsing). One light haptic. No sounds that were skipped are played late. |
| Ready (tap prompt visible) | **Continue:** start the transition below. |
| Transitioning | Nothing. |

Android hardware back while the Finish screen shows = Continue (never exits the game flow).

**Transition into results (option B, about 900 ms).** Time 0 = the Continue tap.

| Time (ms) | What happens | Duration | Easing |
| --- | --- | --- | --- |
| 0 | Result screen mounts underneath, fully laid out, with its score and the header streak pill hidden. Header and nav come back as part of it. | 0 | — |
| 0 | Tap prompt, "best" label and phrase pill fade out. The ring (if still visible) fades out while growing to 115%. | 240 | ease-in |
| 0 | Yellow layer (V2–V4) drops off the bottom: translateY 0 → 105%, revealing beige. | 420 | drop |
| 0 | **Score flies** from the ring center to the exact position and size of the result screen's score (measure both on screen, then animate translate + scale). Its color blends to the result screen's score color. | 520 | travel |
| 0 | **Flame pill flies** to the exact position and size of the header streak pill. Its shadow switches to the header's `0 2px 0` style. It keeps burning while it flies. | 560 | travel |
| 380 | All other result-screen elements (header avatar, badges, stat boxes, breakdown, bottom nav) fade in while rising 14 px, one after another 60 ms apart. | 280 each | fill |
| 520 | The real result score appears; the flying copy is removed. | 0 | — |
| 560 | The real header pill (already in its new color) appears; the flying copy is removed. | 0 | — |

**Handoff to what already exists.**

- **Achievement popups** (`AchievementPopup`, including streak-lit) must not open until the result screen has finished entering (stagger done, about 900 ms). Then they run exactly as today.
- **New-best ribbon, yellow stat boxes and confetti** on the result screen stay as they are. Start the confetti after the entrance finishes so it is not hidden by moving elements.
- **Remove result screens' own number entrances** when arriving from the Finish screen (for example Braining's `br-pop` on the brain-age number), because the flying number replaces them.
- Nothing on the Finish screen should be read by screen readers as a duplicate of the result. Announce the phrase once, then announce the result screen as normal.

## Sound, haptics, and web vs phone

Sound plays on web and phones; haptics are phone-only. All sounds are synthesized in `src/store/sound.js` in the same style as the existing `tick`, `buzz` and `cdTone`, take the `soundOn` setting, and stay no louder than the existing tick. Haptics use `@capacitor/haptics` through a new `src/lib/haptics.js` that silently does nothing on web.

| Time (ms) | Moment | Sound (new function) | Haptic (phones only) | Variants |
| --- | --- | --- | --- | --- |
| 0 | Finish line | `finishBell`: two quick rising tones, about 80 ms each | Impact Heavy | all |
| 200 | Phrase pops in | `phrasePop`: short soft blip | Impact Light | all |
| 1300–2150 | Ring filling | `fillTicks`: up to 10 ticks, rising in pitch with the fill, ending when the count lands | none | all |
| 2160 | Ring lands | `ringLand`: low soft "tock" | Impact Medium | all |
| 2250 / 2850 | Flame catches | `ignite`: short airy whoosh rising in pitch, about 300 ms | none | V1–V4 |
| 2300 | Ring engulfs (new best) | `bestShimmer`: fast rising four-note arpeggio, the biggest sound in the sequence | Impact Heavy | V3, V4 |
| 2600 / 3200 | Flame lit | `flameLit`: two-note chord after a first game, three-note brighter chord when both games are done | Notification Success | V1–V4 |
| 3100 | Yellow flood | `floodSwell`: soft rising swell, about 500 ms | Impact Medium | V2 |
| Skip tap | Jump to end | none | Impact Light | all |
| Continue tap | Into results | `toResults`: soft low swoosh, about 250 ms | Selection | all |

- Make sure the existing global click sound (`attachGlobalClickSound`) does not also fire on the skip and continue taps.
- No sound for the tap prompt itself.

**Where web and phone differ.**

| Topic | Web (cifri.app) | Phones (Capacitor iOS and Android) |
| --- | --- | --- |
| Haptics | None. iPhone browsers block vibration, so web stays the same everywhere. | Full haptic cues as in the table above |
| Yellow screen edges | Yellow layer fills the browser viewport | Yellow must extend under the status bar and the home-indicator area. Switch status bar icons to dark while yellow, and back after the transition. On Android also tint the navigation bar. |
| Back button | Browser back = Continue | Android hardware back = Continue |
| Silent switch | Follows the browser | Must behave exactly like the existing game sounds do today. Do not change the audio session. |
| Performance | Fine on modern browsers | Test the ring engulf on a low-end Android phone. If animating stroke width stutters, replace it with a yellow circle scaled up behind the ring (same look, cheaper). |

## Braining differences

Braining uses the same Finish screen, variants, timeline, sounds and transition. Only what the ring shows and what counts as a new best change.

| Topic | Challenge | Braining |
| --- | --- | --- |
| Time 0 | Timer hits zero | Last of the 50 answers submitted |
| Number inside the ring | Score, counted up from 0 | Brain age, counted *down* from the oldest age on the brain-age scale to the result (younger is better) |
| Ring fill | Score ÷ best score for this difficulty | Best time ÷ this time (capped at 100%). No best time yet = 100% |
| Label under the number | "best {score}" | "{this time} · best {best time}", e.g. "1:24 · best 1:12" |
| New best (V3/V4) | `isNewBest` (score above previous best) | Brain age **strictly lower** than the stored best age, or no stored best age yet |
| Number color in the ring | Green | Green (blends to the result screen's brain-age color during the flight) |
| Uncounted (V5) | Replays / future practice | `isPrac` trials |

**New flag needed.** Today Braining's `isPR` means best *time* (`sec < br.bestTime` in `AppStateContext.jsx`). The Finish screen needs a separate `isAgeBest`. Compute it next to where `bestAge` is updated, comparing against the previous `bestAge` before it is overwritten, and include it in the result object alongside `sec`, `age`, `isPrac`, `isFirst` and `isPR`. Do not change what `isPR` means.

**Result screen celebration (decided).** The Braining result screen also celebrates best *age*. Switch its ribbon, yellow stat boxes and confetti from `isPR` to `isAgeBest`, so the Finish screen and result screen always agree. The "vs best time" stat cell keeps comparing against best time.

## Reduced motion, edge cases, copy, and handoff

**Reduced motion** (`prefers-reduced-motion: reduce`, also the phone's "Reduce motion" setting). Same information, no movement:

- Game screen fades out (220 ms), then the Finish screen fades in already in its final state: phrase at the top, ring filled, final number, flame lit as a solid icon with the dark edge, no wave and no color flow.
- Yellow (V2–V4) arrives as a 300 ms crossfade, not a flood or engulf.
- Tap prompt appears after 600 ms, without pulsing.
- Continue = a 250 ms crossfade into results. No flights, no stagger.
- Sounds and haptics stay unchanged. The 400 ms tap guard stays.

**Edge cases.**

- App sent to background mid-animation: on return, show the final state.
- Never wait on the network. The Finish screen uses the same result object the result screen uses.
- Streak number shown must equal what the header shows after the game.
- Scores of 4 or more digits shrink to fit within 70% of the ring width.
- Never show the same phrase twice in a row; remember the last one.
- Test the longest phrases on a 320 px wide screen in both languages.
- Tablets and landscape: keep the group centered, ring capped at 300 px.

**Copy (i18n keys, English and Russian).**

| Key | English | Russian |
| --- | --- | --- |
| `finish_p1` | Finished! | Финиш! |
| `finish_p2` | Nailed it! | В точку! |
| `finish_p3` | Well done! | Отлично! |
| `finish_p4` | Great run! | Хороший забег! |
| `finish_p5` | Sharp mind! | Острый ум! |
| `finish_p6` | Crushed it! | Мощно! |
| `finish_p7` | Brain warmed up! | Мозг размят! |
| `finish_p8` | Keep it up! | Так держать! |
| `finish_p9` | Superstar! | Суперзвезда! |
| `finish_p10` | Math genius! | Гений! |
| `finish_p11` | Keep going! | Вперёд! |
| `finish_p12` | To the stars! | К звёздам! |
| `finish_p13` | Ad Astra! | Ad Astra! |
| `finish_best` | Getting better and better! (new best only) | Всё лучше и лучше! |
| `finish_tap` | Tap to continue | Нажмите, чтобы продолжить |
| `finish_best_label` | best {n} | рекорд {n} |
| `finish_new_best` | new best! | новый рекорд! |

**Acceptance checklist.**

- [ ] All five variants play exactly per the Timeline table, on web and on an iPhone and an Android phone
- [ ] Header and bottom nav are hidden for the whole Finish screen
- [ ] One tap skips to the final state; a second tap moves to results; taps in the first 400 ms are ignored
- [ ] Score and flame pill land exactly on the result score and header pill, with no jump at hand-over
- [ ] Yellow drops away cleanly; status bar returns to normal on phones
- [ ] Achievement popups open only after the result screen has finished entering
- [ ] Existing ribbon, yellow stat boxes and confetti still work, and confetti starts after the entrance
- [ ] Practice and replays (V5) never show yellow or the new-best phrase
- [ ] Braining ring uses best time; Braining new best uses `isAgeBest`
- [ ] Reduced motion version works
- [ ] Sounds respect the sound setting; haptics fire only on phones
- [ ] Every text is Nunito 900 and every key exists in both languages

**Prompt for the Claude Code session** (Opus recommended: it touches game flow, state and native plugins):

```
Read the spec in full: docs/finish-animation-spec.md
Repo: prostoczar/Cifri, branch react-rewrite.
1. Before writing code, read src/App.jsx (the setScreen('result') and
   setScreen('br-result') paths), ChallengeResultScreen.jsx,
   BrainingResultScreen.jsx, AchievementPopup.jsx, ConfettiBurst.jsx,
   src/store/sound.js, src/store/avatar.js and the Braining result logic in
   AppStateContext.jsx. Tell me in plain language how you will hook in, and
   wait for my OK.
2. Build FinishScreen.jsx, the CSS, the new sounds, haptics.js
   (@capacitor/haptics) and the isAgeBest flag exactly as specified.
3. Do not change the result screens beyond the handoff items listed.
4. Run the build, check every new i18n key exists in en and ru, and give me
   a list of what to test on each variant.
5. Stage only the files you changed by explicit path (never git add -A),
   because other sessions may be working in the same repo.
I have no coding background: explain each step in simple words.
```
