# Brand assets — the app icon's source of truth

`assets/` is not a name chosen for tidiness: it is the first directory `@capacitor/assets` looks
in (it checks `assets`, then `resources`, and `--assetPath` overrides both). The three files at
the top level carry the exact names that tool's custom mode expects, so generating the iOS,
Android and PWA icon sets later needs no renaming step and no flags:

| File | Source | What it is |
|---|---|---|
| `icon-only.png` | `source/cifri-icon-1024-appstore-final.png` | the full icon — the App Store / platform icon |
| `icon-foreground.png` | `source/cifri-icon-adaptive-foreground.png` | Android adaptive foreground — the mark alone, transparent, with the safe-zone padding baked in |
| `icon-background.png` | `source/cifri-icon-adaptive-background.png` | Android adaptive background — flat colour |

They are copies rather than the originals so that the originals keep the names they were designed
and delivered under, and so a future rename inside the tool's vocabulary cannot quietly orphan
them. Regenerate a copy from `source/` if the original ever changes.

`source/` holds the delivered sets untouched, SVG and PNG for each. `cifri-icon-favicon-16` and
`-32` have no `@capacitor/assets` slot — it generates its own PWA icons — and are kept here
because they are part of the same delivery and there is nowhere better for them to live.

The SVGs are the true masters; every PNG is a 1024×1024 render of one.

## Why the App Store icon is a second, later drawing

`cifri-icon-1024.svg` came first and is **superseded**. It is kept only as history — do not wire
anything new to it. It bakes its own rounded corners in and carries an alpha channel, and both are
disqualifying for the thing an app icon has to be:

- App Store review **rejects** an icon with an alpha channel outright.
- iOS applies its own rounded-rect mask to whatever it is given, so pre-rounded corners get
  rounded a second time and the icon reads visibly smaller and softer than its neighbours.

`cifri-icon-1024-appstore-final.svg` is the answer to both: square corners, full-bleed, and opaque
in all four true corners (the renders confirm `hasAlpha: no`). Its trick is that the beige card is
drawn oversized and shifted above the canvas, so the darker beige beneath is revealed along a
curve that matches the rounding iOS will apply, rather than as a straight band across the bottom.

## Not here yet

There is no `splash.png` / `splash-dark.png` (2732×2732 each). Without them the tool still
generates icons, but splash screens will be missing. Add them before the first native build.

## Generating (not yet run)

```
npx @capacitor/assets generate
```

Deliberately not run yet — there are no `ios/` or `android/` projects to generate into.

## Two uses outside the icon pipeline

`public/icons/icon-{180,192,256,384,512}.png` — what a phone shows once the web app is added to
the Home Screen — are downscales of `source/cifri-icon-1024-appstore-final.png`, so the installed
web app and the store listing are the same drawing. `public/icons/favicon-{16,32}.png` are
deliberately **not** from it: a browser tab is small enough that the card and its reveal turn to
mud, and the favicon pair was drawn separately for that size.

`src/screens/OnboardingScreen.jsx` imports `source/cifri-icon-adaptive-foreground.svg` directly
for the mark at the top of the welcome screen, rather than keeping a second copy under `src/`.
Two copies of a logo drift; one does not.
