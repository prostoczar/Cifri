# Brand assets — the app icon's source of truth

`assets/` is not a name chosen for tidiness: it is the first directory `@capacitor/assets` looks
in (it checks `assets`, then `resources`, and `--assetPath` overrides both). The three files at
the top level carry the exact names that tool's custom mode expects, so generating the iOS,
Android and PWA icon sets later needs no renaming step and no flags:

| File | Source | What it is |
|---|---|---|
| `icon-only.png` | `source/cifri-icon-1024.png` | the full icon — mark on its green card |
| `icon-foreground.png` | `source/cifri-icon-adaptive-foreground.png` | Android adaptive foreground — the mark alone, transparent, with the safe-zone padding baked in |
| `icon-background.png` | `source/cifri-icon-adaptive-background.png` | Android adaptive background — flat colour |

They are copies rather than the originals so that the originals keep the names they were designed
and delivered under, and so a future rename inside the tool's vocabulary cannot quietly orphan
them. Regenerate a copy from `source/` if the original ever changes.

`source/` holds the delivered set untouched, SVG and PNG for each: the three above plus
`cifri-icon-favicon-16` and `cifri-icon-favicon-32`, which `@capacitor/assets` has no slot for —
it generates its own PWA icons — and which are kept here because they are part of the same
delivery and there is nowhere better for them to live.

The SVGs are the true masters; every PNG is a 1024×1024 render of one.

## Not here yet

There is no `splash.png` / `splash-dark.png` (2732×2732 each). Without them the tool still
generates icons, but splash screens will be missing. Add them before the first native build.

## Generating (not yet run)

```
npx @capacitor/assets generate
```

Deliberately not run yet — there are no `ios/` or `android/` projects to generate into.

## One use outside the icon pipeline

`src/screens/OnboardingScreen.jsx` imports `source/cifri-icon-adaptive-foreground.svg` directly
for the mark at the top of the welcome screen, rather than keeping a second copy under `src/`.
Two copies of a logo drift; one does not.
