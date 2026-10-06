# Cifri — Launch & Celebration Animations Spec

Oct 6, 2026 · @Bogdan Maximov

## Overview

This spec adds eight animated moments to Cifri. It builds on the Finish screen spec (`docs/finish-animation-spec.md`), which is already live: reuse its easing names, its `Flame.jsx` burning flame, its sound and haptics helpers, and its tap-to-skip pattern rather than creating new versions.

**Build order.** Build, test and commit one feature at a time, in this order. Each one must work on its own before the next starts.

| # | Feature | Where the player sees it |
| --- | --- | --- |
| 1 | Launch animation | Every cold start of the app |
| 2 | Answer feedback | Every answer in every game |
| 3 | Timer's last seconds | Final 5 seconds of a Challenge |
| 4 | 3-2-1-GO polish | Before every game |
| 5 | Achievement ceremonies | After results, when achievements unlock |
| 6 | Streak milestone ceremonies | After results, on milestone days |
| 7 | Streak lost | On opening the app after a missed day |
| 8 | Account created / Welcome back | After sign-up, or after signing in on a device |

**Locked visual rules (unchanged).**

- Nunito 900 for all text.
- Brand colors only: green `#0f9d6c`, yellow `#ffd166`, terracotta `#d65a3a`, beige `#fdf8f3`, plus the tier tints in the Shared foundations section. No blue, no purple.
- Shadows are solid bottom-offset, never blurred. No neumorphism.

**Code this touches (branch `react-rewrite`).** Read these before planning; names are from the current code and may need confirming.

| File | Why |
| --- | --- |
| `index.html` (+ a small inline script/SVG) | Launch animation must run before the React bundle loads |
| `capacitor.config.json`, iOS/Android splash assets | Plain background splash (no logo, no white flash) |
| `src/App.jsx` | Launch hand-off, ceremony queue after results, streak-lost entry |
| `src/screens/ChallengeGameScreen.jsx`, `src/hooks/useChallengeGame.js` | Answer feedback, timer's last seconds |
| `src/screens/BrainingGameScreen.jsx`, `src/hooks/useBrainingGame.js` | Answer feedback (respect the existing Submit lock) |
| `src/screens/CountdownScreen.jsx` | 3-2-1-GO polish |
| `src/components/AchievementPopup.jsx` | Replaced by the new ceremony component |
| `src/components/StreakRestoreModal.jsx` | Replaced by the new streak-lost scene (same logic and choices) |
| `src/components/Flame.jsx` | Reused for every flame in this spec |
| `src/screens/OnboardingScreen.jsx`, `LoginScreen.jsx`, `src/components/ProfileSheet.jsx` | Launch first-time ending; account created / signed-in success paths |
| `src/store/achievements.js` | Read only: rarities, rewards, streak thresholds. **Do not change the catalogue.** |
| `src/store/sound.js`, `src/lib/haptics.js` | New sounds and haptic cues |
| `src/index.css` | New styles, keyframes, reduced-motion rules; recolor rarity chips |
| `src/i18n_data.js` | New English and Russian strings |

**Out of scope.** Leaderboards, ranks, Hall of Legends and weekly results are not built yet and get their own animation specs later.

## Shared foundations

**Tier palette.** Used by achievement ceremonies (by rarity) and streak milestones (by milestone). One palette, five tiers.

| Tier | Background | Title text | Body text | Top chip (bg / text) | Ring color | Medallion symbol / shadow | Flame edge |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Common (grey) | `#e3dfda` | `#2b2b2b` | `#6b6259` | `#6b6259` / white | `#a39d96` | `#6b6259` / `#bdb7b0` | `#5a554f` |
| Uncommon (beige) | `#efdcc0` | `#3d2c14` | `#7a6040` | `#8a6a3e` / white | `#b08a55` | `#8a6a3e` / `#d2b78e` | `#7a5a2e` |
| Rare (red) | `#d65a3a` | white | `#fbe1d8` | white / `#b8462a` | `#f2a58f` | `#d65a3a` / `#a8412a` | `#7a2e1a` |
| Epic (green) | `#0f9d6c` | **yellow `#ffd166`** | `#dff3ea` | **yellow `#ffd166` / `#3d2a00`** | white + inner ring `#ffd166` | `#0f9d6c` / `#0a7a54` | `#0a5c40` |
| Legendary (gold) | `#ffd166` | `#3d2a00` | `#6b4c00` | `#3d2a00` / `#ffd166` | terracotta `#d65a3a` + white beams | `#c48a00` / `#c49030` | `#7a5200` |

On every green screen (epic achievements, green streak milestones) the title and the big number are yellow, not white.

**Also recolor the existing rarity chips** in the achievements list (`.ms-rarity` classes in `index.css`, currently blue for rare and purple for epic) to this palette, so the list and the ceremonies match.

**Easing.** Reuse the names from the Finish screen spec: pop, glide, fill, grow, travel, drop. New ones here:

| Name | Value | Feels like |
| --- | --- | --- |
| stamp | keyframes: from translateY(-220px) scale(1.6), 55% scale(1.18, 0.84), 78% scale(0.95, 1.06), 100% normal; `cubic-bezier(.5,0,.2,1)` | dropped from above, squashes on impact, settles |
| spinIn | scale 0 → 1 while rotating 20°, 500 ms `cubic-bezier(.2,.8,.3,1)`, then a slow endless rotation | a ring that opens and keeps turning |
| burst | small dots fly outward and fade, 750 ms `cubic-bezier(.1,.7,.3,1)` | sparks |

**Sound.** Every sound is synthesized in `src/store/sound.js` in the same style as the existing ones, obeys the sound setting, and is never louder than the existing tick. Each feature lists its sounds. Phone browsers block sound until the player has tapped, so the launch sound will usually be silent on web; everything else happens after a tap and works on web too.

**Haptics.** Phones only, via `src/lib/haptics.js` (does nothing on web). Each feature lists its cues using Capacitor's names: Impact Light/Medium/Heavy, Selection, Notification Success/Warning/Error.

**Tap pattern (ceremonies, streak screens, account moments).** Same as the Finish screen. Ignore taps for the first 400 ms. A tap during the animation jumps to the final state (no late sounds). When "Tap to continue" shows (pulsing opacity 0.2 ↔ 1, 900 ms), a tap continues. Android back = continue.

**Reduced motion** (phone setting or `prefers-reduced-motion`). Nothing flies, spins, shakes, floods or waves. Each screen appears in its final state with a 250 ms fade; flames are lit and still; color changes are 300 ms crossfades. Sounds and haptics stay. Each feature notes anything extra.

## Feature 1 — Launch animation

**What it is.** A green line and a yellow line enter from opposite screen edges, chase each other around a lopsided ∞ while the app loads, then peel off and spiral into the "C" and the "i" of the logo. The dot ignites, the terracotta rays burst like sparks, "Cifri" appears, and the app opens.

**When it plays.**

- Phones: every cold start (first open, or after the app was fully closed or crashed). Returning from the background shows no animation.
- Web: every fresh page load.
- One version only (about 2.5 s on an instant load). No short version.

**Where it lives (important).** The animation must start before the React bundle has loaded, because it covers that loading. Build it as plain HTML, CSS, inline SVG and a small vanilla script inside `index.html`, drawn above `#root`. React mounts underneath as normal. When React has restored the session and saved progress and knows which first screen to show, it fires `window.dispatchEvent(new CustomEvent('cifri:ready', { detail: { firstTime } }))`. The overlay then forms the logo, plays the ending and removes itself.

**Splash and background.** Replace Capacitor's default white splash with a plain background-color splash (beige `#fdf8f3`, dark in dark mode), no logo, so the lines draw onto a matching blank screen. Set the same background on `index.html` so web never flashes white.

**Layout.**

- Logo drawn from `assets/source/cifri-icon-adaptive-foreground.svg` (1024-unit box). Box width 83% of screen width, max 320 px.
- Shift the logo right by about 3% of screen width so it looks centered (the heavy "C" makes the true center look left).
- Wordmark "Cifri", Nunito 900, 18% of screen width tall, `#2b2b2b` (light text color in dark mode), about 20 px below the logo artwork. Logo plus wordmark are centered vertically as a group.
- The ∞ is centered on the true center of the screen.

**Phases.** Times are from first paint unless noted.

| Phase | Time | What happens | Easing |
| --- | --- | --- | --- |
| Entry | 0–450 ms | Green line enters horizontally from beyond the left edge and joins the top of the ∞'s left loop. Yellow enters from beyond the right edge and joins the top of the right loop. | Fast start, slowing to loop speed |
| Loop | until ready | Both lines travel the same ∞ in the same direction, half a loop apart. Left loop 1.15× larger, right loop 0.78× (echoes the big C and small i). Each line is 30% of the loop's length. Speed about 4.5 logo-units/ms (one lap ≈ 0.7 s). Stroke widths match the logo (C 135, i 134.6). | linear |
| Loading message | from 2.5 s of looping | "Hold tight, crunching numbers…" fades in (400 ms) under the ∞, 15 px `#8a8178`, then pulses opacity 1 ↔ 0.45 every 900 ms. Fades out (200 ms) when ready. | ease-in-out |
| Formation | ready + 0–820 ms | Each line continues forward from where it is. Green leaves at the far-left point of the big loop and spirals clockwise (at least 1.1 turns), shrinking onto the C's radius, then traces the C exactly. Yellow leaves at the far-right point of the small loop, spirals counter-clockwise onto the stem's top and runs down the stem (780 ms). Line lengths blend to the final C arc and stem lengths. | Starts at loop speed, eases to a stop |
| Dot | ready + 820 ms | Yellow dot pops: scale 0 → 1.35 → 0.92 → 1, 320 ms | ease-out |
| Rays | ready + 920 ms (+22 ms each) | The 7 terracotta rays burst out from the dot center with a slight overshoot, 340 ms each | `cubic-bezier(.2,.8,.3,1)` |
| Sparks | ready + 920 ms | 12 small terracotta and yellow dots fly outward and fade, 560 ms | burst |
| Wordmark | ready + 1100 ms (+45 ms per letter) | Each letter of "Cifri" fades in while rising 14 px, 280 ms | fill |
| Ending | ready + 1600 ms | See below |  |

**Endings.**

- **Returning player** (to the Challenge screen): the logo grows to 5× while fading (480 ms, accelerating); the wordmark grows to 1.8× while fading (380 ms); the Challenge screen fades in from 1.06× scale (420 ms, 120 ms delay).
- **First-time player** (to the onboarding screen): the logo flies to the exact position and size of the onboarding logo (`.ob-mark`, 136 px) and the wordmark to `.ob-wordmark` (30 px, stays dark, no pill), 480 ms travel. The onboarding screen's other elements then use their existing fade-in, starting at 520 ms, 50 ms apart.

**Skip.** Taps do nothing while loading. Once ready, a tap jumps to the finished logo and runs the ending immediately.

**Sound and haptics.** At the dot (ready + 820 ms): new sound `launchSpark` (short bright chime plus a soft whoosh) and Impact Medium. The overlay runs before React, so it reads the sound setting directly from the same saved setting the app uses. On web it will usually be silent (browser rule).

**Dark mode.** Follow the app's saved theme (and the system setting where the app does). Dark background; wordmark and loading text in the light text color; logo colors unchanged.

**Reduced motion.** No lines or spirals. The finished logo and wordmark fade in (300 ms), and the ending is a 250 ms crossfade. On a slow load, the static logo shows with the loading message (no pulse).

**Very slow connection.** The ∞ keeps looping for as long as it takes. Once React is up, the app's existing offline handling takes over.

## Features 2–4 — Inside the game

These three run during play, so they must never slow the player down. Answers are accepted exactly as fast as today, and nothing here may delay the next question or block typing.

### Feature 2 — Answer feedback (Challenge, Braining, Practice, Tricks)

| Answer | What happens | Timing | Phone haptic | Sound |
| --- | --- | --- | --- | --- |
| Correct | Answer box tints green and bumps: scale 1 → 1.08 → 1. Then the question and box slide out 28 px to the left and fade, and the next question slides in from 28 px on the right. | Bump 140 ms; slide out 90 ms (ease-in) starting at 150 ms; slide in 120 ms (ease-out) | Impact Light | Existing tick, unchanged |
| Wrong | Answer box tints terracotta and shakes sideways: 0 → −9 → 8 → −6 → 4 → 0 px. Tint clears at 300 ms. | 220 ms, ease-out | Two quick Impact Light taps, 80 ms apart | Existing buzz, unchanged |

- Fit inside the game's existing pause after a correct answer (Braining has about 200 ms). If a mode shows the next question sooner, shorten the slide rather than delay the question.
- Keep Braining's new Submit lock exactly as it is: the slide happens while Submit is locked.
- Reduced motion: tint only, no bump, slide or shake.

### Feature 3 — Timer's last seconds (Challenge)

The bar already turns terracotta in the last 10 seconds, and the urgent tick plays in the last 5. Add, on each whole second from 5 down to 1:

- The seconds number pops: scale 1.35 → 1, 260 ms, `cubic-bezier(.2,.8,.3,1)`.
- The timer bar pulses: scaleY 1 → 1.8 → 1, 240 ms, ease-out.
- Phones: Impact Light on each tick, in sync with the urgent tick sound.
- At 0 the number pulses once more (scale 1 → 1.5 → 1, 300 ms), then the Finish screen takes over as specified.
- Reduced motion: no pops or pulses; haptics stay.

### Feature 4 — 3-2-1-GO polish

Keep everything players like today: the same tiles (3 terracotta, 2 yellow, 1 light green, GO green), the same colors, the same pop-in, the same 800 ms per beat and the same tones. **The game must start at exactly the same moment as today.** Change only:

| Moment | Change | Timing |
| --- | --- | --- |
| Each number leaving | Instead of vanishing, it shrinks to 0.5×, rises 30 px and fades | 160 ms, ease-in |
| GO appearing | Pops: scale 0.3 → 1.15 → 1 | 320 ms, ease-out |
| GO leaving | 560 ms after appearing, GO grows to 4× while its corners round further and it fades; the game screen fades in from 0.92× scale behind it | GO 320 ms (accelerating); game 280 ms, 120 ms delay |
| Haptics (phones) | Impact Light on 3, 2 and 1; Impact Heavy on GO | — |

Reduced motion: today's countdown exactly, plus the haptics.

## Feature 5 — Achievement ceremonies

**What it is.** Every achievement becomes its own full-screen event, scaled by rarity. This replaces the current `AchievementPopup` card.

**When and in what order.**

- Ceremonies start once the result screen has finished entering (the moment popups wait for today, about 900 ms after results appear). They never interrupt the Finish screen.
- Order: a streak milestone ceremony first (if any), then achievements from lowest to highest rarity, so the sequence builds to its biggest moment.
- If more than three achievements unlock at once, play ceremonies for the three highest. Show the rest on one closing card, "+{n} more": the same flood in the highest remaining tier's color, with their medallions in a row.
- Each ceremony follows the shared tap pattern. Continuing moves to the next one, and after the last returns to the result screen.
- Achievements unlocked outside a game (for example in Tricks) use the same ceremony, played over whatever screen the player is on.

**Timeline** (0 = ceremony starts).

| Time (ms) | What happens |
| --- | --- |
| 0 | The screen floods with the tier background, a circle growing from the medallion's center (520 ms, grow). |
| 150 | A white pill, "New achievement!", pops in at the medallion position (pop, 480 ms). Text in the tier's medallion-symbol color; shadow `0 3px 0` in the tier's medallion-shadow color. Short two-note chime. |
| 1050 | The pill flies up to the top chip position and fades (380 ms, travel). At 1350 the rarity chip ("EPIC" etc.) pops in exactly there (380 ms, scale to 1.25 and settle). The chip sits above every other layer. |
| 1150 | Legendary only: a green and a white line draw a ∞ around the medallion (800 ms) and fade. This pushes the stamp to 2000. |
| 1300 (legendary 2000) | **Stamp:** the white 116 px medallion with the reward symbol drops in (stamp, 440 ms) with a solid tier-colored shadow. The tier ring opens (see below), sparks burst, the fanfare plays. Epic and legendary add a 220 ms screen shake 240 ms after the stamp. |
| stamp + 320 | Achievement name, 26 px, tier title color, fades up. |
| stamp + 420 | Description, 14 px, tier body color, fades up. |
| stamp + 650 | Reward row fades up: an empty 34 px avatar circle and "New avatar unlocked". |
| stamp + 900 | A copy of the reward symbol flies from the medallion into the avatar circle (480 ms, travel); the circle pops; a soft high ping. |
| stamp + 1300 | "Tap to continue" appears. |

**The ring grows with rarity.**

| Tier | Ring around the medallion | Sparks | Shake |
| --- | --- | --- | --- |
| Common | One thin circle (3 px), pops in | none | no |
| Uncommon | 16 dots in a circle, slowly turning | 10 | no |
| Rare | 12 rounded rays (alternating long and short), turning | 16 | no |
| Epic | 16 white rays turning one way plus an inner ring of 8 yellow rays turning the other way; yellow twinkles appear and vanish around it | 24 | yes |
| Legendary | The ∞ draw first, then 24 terracotta rays (logo-style sunburst), 8 soft white light beams turning the opposite way, 10 orbiting white dots and white twinkles | 34 | yes |

**Sound** (new `achievementFanfare(tier)` in `sound.js`).

- **Common:** a short rising chime.
- **Uncommon:** a longer rising chime.
- **Rare:** adds a whoosh.
- **Epic:** adds a low boom and an octave-up chord.
- **Legendary:** all of the above plus a deep sub-boom and a sparkling run on top.

**Haptics** at the stamp: Impact Light (common), Medium (uncommon, rare), Heavy (epic), Heavy followed by Notification Success (legendary).

**Skip.** A tap during the ceremony jumps to the final state: medallion in place, reward already in the avatar, ring turning, "Tap to continue" showing.

**Reduced motion.** The flood becomes a 300 ms crossfade. The pill shows briefly, then the final layout fades in with rings shown still, and there are no shakes or flying symbols.

## Feature 6 — Streak milestone ceremonies

**What it is.** A flame-themed ceremony on 13 milestone days. A ring of dots fills, the flame heats up and catches, then the tier's own celebration plays. It uses the same tier palette, rings, sparks, fanfare and haptics as achievements, with the burning flame in place of the medallion.

**Milestones and texts.** Only these days get a streak ceremony.

| Days | Tier | English | Russian |
| --- | --- | --- | --- |
| 7 | Grey | One week down. Your brain has noticed. | Неделя позади. Мозг это заметил. |
| 14 | Grey | Two weeks. It's officially a habit. | Две недели. Это уже привычка. |
| 30 | Grey | A whole month. Your neurons now pay rent here. | Целый месяц. Нейроны теперь платят здесь аренду. |
| 60 | Beige | Two months. Your brain renewed its subscription. | Два месяца. Мозг продлил подписку. |
| 90 | Beige | Ninety days. A whole season of sharp thinking. | Девяносто дней. Целый сезон острого ума. |
| 120 | Beige | 120 days. Mental math is now your native language. | 120 дней. Устный счёт теперь ваш родной язык. |
| 150 | Red | 150 days. Calculators are filing complaints. | 150 дней. Калькуляторы подают жалобы. |
| 183 | Red | You are a Cifri tax resident. | Вы налоговый резидент Cifri. |
| 210 | Red | 210 days. Your streak is older than some houseplants. | 210 дней. Ваша серия старше некоторых комнатных растений. |
| 240 | Green | Eight months. Numbers line up when you walk in. | Восемь месяцев. Цифры выстраиваются, когда вы входите. |
| 270 | Green | 270 days. Three quarters of the way around the sun. | 270 дней. Три четверти пути вокруг Солнца. |
| 300 | Green | 300 days. Your brain runs on Cifri now. | 300 дней. Ваш мозг теперь работает на Cifri. |
| 330 | Gold | 330 days. The finish line is in sight. | 330 дней. Финиш уже виден. |
| 365 | Gold | A full lap around the sun. Legend status. | Полный круг вокруг Солнца. Статус: легенда. |

Tier names map to the palette: grey = Common, beige = Uncommon, red = Rare, green = Epic, gold = Legendary.

**How this fits the achievement catalogue (do not change the catalogue).** Check the real thresholds in `achievements.js`; today they are 7, 14, 30, 60, 90, 180, then every 30 days to 360.

- **Milestone day that is also a streak achievement** (for example 30): play only the streak ceremony and include the achievement's reward row inside it. No separate achievement ceremony.
- **Milestone day without a streak achievement** (for example 120, 183, 365): streak ceremony without a reward row.
- **Streak achievement day that is not a milestone** (180, 360): the normal achievement ceremony, in its catalogue rarity.
- The chip always reads "{n}-DAY STREAK", never a rarity name, so tier colors never clash with the rarity shown in the achievements list.

**When.** After the result screen of the game that took the streak to a milestone, before any achievement ceremonies.

**Timeline** (0 = ceremony starts).

| Time (ms) | What happens |
| --- | --- |
| 0 | Screen floods with the tier background (520 ms, grow). |
| 250 | Chip "{n}-DAY STREAK" pops in at the top, above everything. A white 100 px disc pops in at center with a solid tier-colored shadow. |
| 300 | The flame (60–70 px, from `Flame.jsx`) fades in **unlit**: solid grey `#d9d1c6` with a `#b9b0a4` edge. |
| 350 | 16 empty dots fade in on a ring around the disc (radius 74 px, 12 px dots, white at 45% with a 2 px tier-dot-colored outline), 15 ms apart. **Always 16, whatever the milestone**; this is a visual build-up, not a day count. |
| 600 + 55 ms per dot | Each dot fills with the tier dot color (grey `#6b6259`, beige `#8a6a3e`, red and green `#ffd166`, gold `#d65a3a`) and pops (scale to 1.7, 240 ms), with a soft note rising one octave across the 16 dots. |
| 1600 | **Heat up:** terracotta rises through the flame from the bottom (320 ms), then it switches to the burning state (upward color flow, wave, dark edge in the tier's flame-edge color). Soft whoosh. |
| 1980 (gold: ∞ draws from 1880, so 2680) | **Tier moment:** the dots fade out (300 ms); the tier ring opens around the disc; sparks; the tier fanfare; the flame pops (scale 1.4 with a −8° tilt, settles, 520 ms) and keeps burning. Shake for green and gold. |
| tier moment + 0 | The big number counts up from 0 to {n} (300 ms + 2 ms per day, max 900 ms), 58 px, tier title color (yellow on green). |
| tier moment + 300 | "day streak!" fades up (22 px). |
| tier moment + 450 | The milestone text fades up (15 px, tier body color). |
| tier moment + 650 / + 900 | Reward row and flying reward symbol, only if this day is also a streak achievement. |
| tier moment + 1200 | "Tap to continue". |

**Haptics.** Selection on each dot fill; then the tier's achievement haptics at the tier moment.

**Russian plurals.** "{n}-DAY STREAK" and "day streak!" need Russian plural forms (дня / дней). Use i18next plural keys; see the copy table.

**Reduced motion.** The final layout fades in (lit, still flame and a full dot ring); the tier ring is shown still; sounds and haptics stay.

## Feature 7 — Streak lost

**What it is.** A full-screen scene that replaces the look of today's `StreakRestoreModal`. The rules for when it appears, whether a restore is available, and what Restore and Start fresh do stay exactly as they are. The player sees their lit streak cool down into embers, then chooses.

**Hard rule.** The flame and the streak number stay visible for the whole scene. They change color, but they never disappear until the final flight into the header.

**Layout** (beige background, centered).

- "You missed a day", 14 px, `#8a8178`, near the top.
- A white 120 px disc with a solid `#e3dbd0` shadow, and the burning flame (about 70 px, `Flame.jsx`) centered on it.
- The streak number (48 px) and "day streak" (15 px) under the disc.
- Below that: title, short text and the two buttons.

**Timeline** (0 = scene opens).

| Time (ms) | What happens |
| --- | --- |
| 0–300 | Everything fades up. The flame is lit and burning; the number is terracotta `#d65a3a`. |
| 1000 | **Cooling:** grey `#d9d1c6` drains down through the flame from top to bottom (1200 ms, ease-in-out). The edge turns `#b9b0a4`, the wave slows and stops, the flame shrinks to 0.92×, the number fades to grey `#b9b0a4`, and 10 soft grey smoke puffs rise from the flame tip and fade (one every 110 ms). Sad descending tune. |
| 2300 | Final cold state is set explicitly (grey flame, still, 0.92×). **Embers:** tiny terracotta and yellow dots keep rising from the flame and fading, one every 220 ms, until the player chooses. Title, text and buttons fade up. |

**Text and buttons.**

| Restore available | Restore not available |
| --- | --- |
| Title: "Your streak cooled down" | Same title |
| Text: "The embers are still warm. Restore your {n}-day streak?" | Text: "No restores left this time. Your best streak is still saved." |
| Green button "Restore streak" (solid `0 3px 0 #0a7a54` shadow) | Greyed button "No restores left" (`#e9e3da`, text `#a39d96`, no shadow, does nothing) |
| Plain text button "Start fresh" | Same |

**Restore streak.**

| Time (ms) | What happens |
| --- | --- |
| 0 | Embers stop. Text, buttons and "You missed a day" fade out. The white disc turns green `#0f9d6c` (300 ms) with a `0 5px 0 #0a7a54` shadow and pops (scale 1.12). |
| 200 | **Relight:** the flame returns to full size, and terracotta rises through it from the bottom (350 ms). Relight sound: a whoosh plus a rising four-note chime and a low warm note. Phones: Impact Medium. |
| 560 | The flame switches to burning (upward color flow, dark edge `#0a5c40`), pops (scale 1.4, −8° tilt, settles, 520 ms) and starts waving. 20 sparks burst (yellow, green, terracotta). The number turns green and pops. The title changes to "Streak restored!" and pops. Phones: Notification Success. |
| 2300 | **Automatic exit (no tap):** disc, number and title fade (250 ms). The burning flame flies to the header pill's flame position and shrinks to its size (560 ms, travel). The home screen fades in (260 ms) from 420 ms, with the pill already green and showing the restored number. |

**Start fresh.**

| Time (ms) | What happens |
| --- | --- |
| 0 | Embers stop. Text and buttons fade out. The number counts down to 0 (600 ms). The title changes to "A new streak starts today". Soft two-note tone. |
| 1700 | **Automatic exit:** the grey flame flies to the header pill (560 ms); the home screen fades in with a grey pill showing 0. |

**Reduced motion.** The cold state appears directly (no draining, smoke or embers). Restore makes a 300 ms crossfade to the green disc and lit, still flame, then a crossfade to home. Start fresh sets 0 and crossfades to home.

## Feature 8 — Account created and Welcome back

Two mirror-image scenes on a beige background. Both use the player's real avatar, username and stats, and both follow the shared tap pattern.

**When.**

- **Account created:** right after a guest successfully creates an account (including any import of their local progress).
- **Welcome back:** right after signing in on a device where the account's progress is downloaded and restored. Not shown for routine silent session refreshes.

**Elements.** The player's avatar (96 px circle with their avatar symbol and solid shadow), a green ring around it (radius 60 px, 7 px stroke, round caps), a green check badge (34 px, white ✓, solid `0 2px 0 #0a7a54` shadow) at its lower right, and three stat chips: streak pill (green when lit), "Best {score}", and "{n} badges".

### Account created — progress flows in

| Time (ms) | What happens |
| --- | --- |
| 0 | Avatar pops in at center (420 ms). |
| 150 | The three stat chips appear around the avatar (260 ms each, 80 ms apart). |
| 800 (+120 ms each) | Each chip flies into the avatar, shrinking and fading (380 ms, travel); the avatar gives a small bump and a soft ping as each one lands. |
| 1300 | The green ring draws around the avatar (520 ms, fill). |
| 1800 | The check badge pops (380 ms, scale 1.4). Success chime plus a low warm note; 16 sparks (green, yellow, terracotta). Phones: Notification Success. |
| 1850 | "Welcome, @{username}" (22 px) fades up, then "Your progress is saved." (14 px, `#6b6259`). |
| 2300 | "Tap to continue". |

### Welcome back — progress flows out

| Time (ms) | What happens |
| --- | --- |
| 0 | "Welcome back!" (34 px, `#2b2b2b`) pops in near the top. The avatar pops in at center. |
| 300 | The green ring draws (520 ms). |
| 800 | The check badge pops. Welcome chime (the same family as the success chime, in a different order) plus sparks. Phones: Notification Success. |
| 1100 (+120 ms each) | The three stat chips fly *out* of the avatar to their places, each overshooting slightly (440 ms), with a soft ping each. |
| 1500 | "@{username}" (22 px) fades up, then "Everything is restored." (14 px). |
| 1900 | "Tap to continue". |

**Reduced motion.** The final layout fades in (ring drawn, check shown, chips in place); sounds and haptics stay.

## Copy, checklist and handoff

**New strings** (English / Russian, formal "вы"). The streak milestone texts are in the Feature 6 table. Reuse existing keys where the app already has them (rarity names, "Tap to continue").

| Where | English | Russian |
| --- | --- | --- |
| Launch, slow load | Hold tight, crunching numbers… | Минутку, считаем цифры… |
| Achievement intro | New achievement! | Новое достижение! |
| Rarity chips | COMMON / UNCOMMON / RARE / EPIC / LEGENDARY | ОБЫЧНОЕ / НЕОБЫЧНОЕ / РЕДКОЕ / ЭПИЧЕСКОЕ / ЛЕГЕНДАРНОЕ (or existing rarity keys) |
| Reward row | New avatar unlocked | Новый аватар открыт |
| Extra achievements card | +{n} more | Ещё +{n} |
| Streak chip (plural) | {n}-DAY STREAK | СЕРИЯ: {n} ДЕНЬ / ДНЯ / ДНЕЙ |
| Streak label (plural) | day streak! | день подряд! / дня подряд! / дней подряд! |
| Streak lost | You missed a day | Вы пропустили день |
| Streak lost | Your streak cooled down | Ваша серия остыла |
| Streak lost (plural) | The embers are still warm. Restore your {n}-day streak? | Угольки ещё тёплые. Восстановить серию из {n} дня / дней? |
| Streak lost | No restores left this time. Your best streak is still saved. | Восстановлений больше не осталось. Ваш лучший результат сохранён. |
| Buttons | Restore streak / No restores left / Start fresh | Восстановить серию / Нет восстановлений / Начать заново |
| Restored | Streak restored! | Серия восстановлена! |
| Fresh start | A new streak starts today | Сегодня начинается новая серия |
| Account created | Welcome, @{username} / Your progress is saved. | Добро пожаловать, @{username} / Ваш прогресс сохранён. |
| Signed in | Welcome back! / Everything is restored. | С возвращением! / Всё восстановлено. |

**Acceptance checklist.**

- [ ] Launch starts before React loads, loops the ∞ until ready, shows the loading message after 2.5 s, and forms the logo from wherever the lines are
- [ ] Launch ends correctly for returning players (Challenge screen) and first-time players (onboarding, logo and wordmark land exactly)
- [ ] No white flash on web or phones; dark mode correct; plays on cold start only
- [ ] Answer feedback never delays questions or typing; Braining's Submit lock untouched
- [ ] Timer pulses on 5–1 in sync with the urgent tick; haptics on phones
- [ ] 3-2-1-GO starts the game at exactly the same moment as before
- [ ] Achievement ceremonies: flood and pill appear together; chip on top; ring, sparks, shake and fanfare scale with rarity; reward flies into the avatar
- [ ] Ceremony order: streak first, then achievements lowest to highest; maximum three plus a "+{n} more" card
- [ ] Rarity chips in the achievements list recolored; no blue or purple anywhere
- [ ] Streak ceremonies on exactly the 13 milestone days; 16 dots always fill; flame heats up before the tier moment; yellow titles on green
- [ ] Streak achievement days 180 and 360 get the normal achievement ceremony; no double ceremonies
- [ ] Streak lost: flame and number never disappear; Restore visibly relights and goes home automatically; "No restores left" state works
- [ ] Account created and Welcome back show real avatar, username and stats
- [ ] All sounds obey the sound setting; haptics only on phones; reduced motion works for every feature
- [ ] Russian plurals correct (1, 2–4, 5+, and numbers like 183)
- [ ] Every new key exists in English and Russian; Nunito 900; brand colors; solid shadows only

**Prompt for the Claude Code session** (Opus recommended):

```
Read the spec in full: docs/launch-celebrations-spec.md. It builds on
docs/finish-animation-spec.md, which is already implemented. Reuse its
Flame.jsx, sound and haptics helpers, easing and tap-to-skip pattern.
Repo: prostoczar/Cifri, branch react-rewrite.
I have no coding background: explain everything in plain, simple words.

1. Investigate first, change nothing. Read the files listed in the spec's
   Overview table plus anything they lead to. Confirm the real streak
   achievement thresholds in achievements.js and where sign-up and
   sign-in succeed. Then give me a short plain-language plan per feature
   and anything risky or unclear. WAIT for my OK.
2. Build the eight features in the spec's order, ONE AT A TIME. After each
   feature: run npm run check, npm run lint and the build; give me a short
   test script for it (web and phone); show me the file list; ask before
   committing. Commit each feature separately. Then move to the next.
3. Do not change the achievement catalogue, the streak-restore rules, or
   anything not listed in the spec. If the spec conflicts with how the code
   works, stop and ask. Don't guess.
4. Stage only files you changed, by explicit path. Never git add -A or
   git add . Don't push until I say so.
```

## Decisions made during build

Agreed on 6 Oct 2026, before any code was written, after the code had been read against this spec. Where a line below differs from a section above, this section is what was built.

**Launch and splash.**

- **Background (changed).** The launch screen uses the app's own page background, white `#ffffff`, or `#161513` in dark mode, not beige, so nothing changes colour when the app takes over. The phone splash uses the same two colours.
- **Splash dark mode.** The phone's own splash appears before the app has read any saved setting, so it follows the phone's dark-mode setting. The launch animation itself follows the app's saved theme, as specified.
- **Loading message.** "Hold tight, crunching numbers…" is kept in `src/i18n_data.js` like every other string, and copied into `index.html` when the app is built, because it has to be on screen before the app's code has loaded.

**Inside the game.**

- **3-2-1-GO timing.** The game still starts at exactly the same moment as before (3200 ms), which wins over the table above: a game cannot fade in before it has started. GO starts leaving 560 ms after appearing, as written; the game screen fades in from 0.92× at its usual start moment, 240 ms after GO starts leaving rather than 120 ms; GO finishes its exit on top of it.
- **Wrong answer.** The terracotta tint clears at 300 ms as specified. The red digits and the "Answer: X" line stay exactly as they were.

**Achievement and streak ceremonies.**

- **A. Create account and Share.** Both buttons from the old achievement card are kept. They appear in each ceremony's final state, together with "Tap to continue".
- **B. Cards with no rarity.** "You've lit a streak!" (the first-streak sign-up prompt for guests) plays as a grey (common) ceremony with the flame as its medallion, no rarity chip, no reward row, and the Create account button. It always gets its own ceremony and is never folded into "+{n} more".
- **Day 360 (changed).** No ceremony. It keeps the existing simple streak card, unchanged.
- **After 365.** Every milestone the game counts after 365 (390, 420 and every 30 days after) gets the gold flame ceremony with no reward row. Its text is the existing "You have played any mode in Cifri {n} days in a row."
- **D. Repeat milestones.** A streak ceremony plays every time a game takes the streak onto a milestone day, so a new streak reaching 7 again celebrates again. The reward row shows only when the achievement is genuinely new. No new saved data.
- **14 milestone days.** The Feature 6 table has 14 rows (7, 14, 30, 60, 90, 120, 150, 183, 210, 240, 270, 300, 330, 365); all 14 get the ceremony. "13" in the text above was a miscount.
- **Day 365 achievement fix.** The 365-day streak achievement could never unlock: the rule that decides which days are streak milestones only accepted 7, 14, 30 and multiples of 30. It now accepts 365 too, so the day-365 ceremony includes its reward row. Fixed in its own commit.
- **Russian plurals.** The app has its own translation table, not i18next, so plural forms are separate keys (`_one`, `_few`, `_many`) chosen by the same 1 / 2–4 / 5+ rule `dayWord()` already uses.
- **Account scenes.** "Best {score}" is the highest Challenge best across the three difficulties. "{n} badges" is the number of achievements earned; in Russian, "{n} достижение / достижения / достижений".

**Streak lost.**

- **C. Header pill after Restore.** The flame lands in the real header pill, which stays grey with the restored number. Restoring does not count as playing today, and a green pill would claim the day is done when it is not.
- **When it appears.** The scene waits until the launch animation, any game in progress, or the Finish screen is over. In practice this only matters when the break is noticed at midnight while the app is open.

**Smaller choices made while building** (6–7 Oct 2026, within the rules above).

- **Launch on wide screens.** Sizes are proportions of the app's column (at most 420 px wide), not of a desktop window, so a laptop sees the same picture as a phone.
- **Streak ceremonies keep Create account and Share** too, by the same rule as achievement ceremonies (decision A).
- **"+{n} more" card.** No chip: a big "+{n} more" title in the tier's title colour, and the remaining medallions in a row.
- **Rarity chips everywhere.** The achievements list and the share card both use each tier's flood colour with its title colour (common `#e3dfda`/`#2b2b2b`, uncommon `#efdcc0`/`#3d2c14`, rare `#d65a3a`/white, epic `#0f9d6c`/`#ffd166`, legendary `#ffd166`/`#3d2a00`), the same in dark mode.
- **Dark mode for the beige scenes.** Streak lost, Account created and Welcome back use the dark page colour in dark mode, as the Finish screen decided for itself.
- **Streak lost, Android back.** Does nothing while the choice is on screen: the player must choose, as the spec intends, rather than leave the app mid-decision.
- **Account created, reduced motion.** The chips are shown in their places in the final layout (as the spec's reduced-motion line says), although in the full version they end inside the avatar.
- **Timer's last seconds.** Only counted Challenge runs, the same runs that already get the urgent tick; a timed Practice-tab run does not.
- **Braining's wrong answer.** The answer box's tint is the 300 ms flash; the question card's existing pale-red tint until the player types is unchanged.
- **Ordering guard.** `npm run check:ceremonies` (in `npm run check`) drives the real ceremony queue with every awkward batch: rarity order, the three-plus-"+{n} more" rule, the sign-up card never folded away, and which ceremony each streak day gets (7, 120, 180, 183, 360, 365, 390).

**Testing without real data.** On the dev server only (`npm run dev`; never in a real build), the browser console has `__cifriPreview`: `.ceremony('ch_first', 'ch_moon', …)` (any achievement keys, or `'lit'`), `.streak(n)`, `.lost(n, available)` and `.account('created' | 'back')`. Each plays the scene without dispatching anything, so nothing is saved or synced.
