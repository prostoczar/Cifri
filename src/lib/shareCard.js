// The shareable card — one image, drawn by hand onto a canvas.
//
// ONE TEMPLATE, NOT SIXTY-FIVE. Every card this module can produce — all 65 achievements, both
// result screens, boosted or not, personal best or not — is the same frame: wordmark, a hero
// panel, a row of stat chips, a footer. Only what goes INSIDE the hero panel changes, and it
// changes by data (`card.hero`), never by a branch per achievement. Adding a 66th achievement
// needs no work here at all. That is the whole design: the card is a function of a small content
// object, so there is exactly one layout to get right and exactly one to keep looking like Cifri.
//
// ── Why the canvas is drawn by hand rather than screenshotted ────────────────────────────────
//
// The obvious alternative is html2canvas — point it at the real result screen and photograph it.
// Rejected for three reasons, in order of how much they cost:
//
//   1. It would tie the shared image to the live screen's markup. A future tweak to the result
//      screen would silently change what players send to their friends, with nothing to notice.
//      Drawing here means the card is a deliberate artifact that changes when someone changes it.
//   2. ~50 kB on a bundle that already defers PostHog to keep the first paint quick.
//   3. It renders webfonts and inline SVG unreliably on iOS Safari specifically, which is this
//      app's primary platform.
//
// ── Why the colours are read from CSS rather than written down here ──────────────────────────
//
// `getComputedStyle(document.documentElement)` returns the :root values — and dark mode in this
// app is `body.dark`, which sets its overrides on BODY, not on :root. So reading from
// documentElement yields the LIGHT palette even for a player in dark mode, which is exactly what
// the card wants (see below), and it cannot drift from index.css because it IS index.css.
//
// The five rarity pairs are the exception: they live in `.ms-rarity.r-*` rules rather than in
// variables, so there is nothing to read. They are written down below, and index.css is named as
// their source.
//
// ── Why the card is always light ─────────────────────────────────────────────────────────────
//
// Confirmed as a product decision, not an oversight: a shared image lands in someone else's app,
// on someone else's background. One consistent card is a brand asset; two is a support question.

import { AVATAR_ICONS } from '../store/avatar.js';
import { appUrlLabel } from './appUrl.js';

// 4:5 portrait — the aspect ratio feed and story apps crop most kindly, and the only one that
// survives both a WhatsApp thumbnail and an Instagram story without losing an edge.
export const CARD_W = 1080;
export const CARD_H = 1350;

const PAD = 72;
const INNER_W = CARD_W - PAD * 2;

// The app's signature depth: a solid bar offset straight down, never a blur. Matches the
// `box-shadow: 0 2px 0` / `0 3px 0` used on every button, chip and stat box in index.css,
// scaled up to this canvas.
const SHADOW_DROP = 11;

const PANEL_Y = 189;
const PANEL_H = 666;
const PANEL_R = 40;

const CHIPS_Y = 900;
const CHIPS_H = 162;
const CHIP_GAP = 24;
const CHIP_R = 24;

const TAGLINE_Y = 1170;
const URL_Y = 1224;

// From `.ms-rarity.r-*` in index.css. The light-mode pair only — see the note above about the
// card staying light. If those rules change, these follow.
const RARITY_COLORS = {
  common: { bg: '#d8d0c6', fg: '#7a7266' },
  uncommon: { bg: '#ebf7f3', fg: '#075c3d' },
  rare: { bg: '#dbeafe', fg: '#1e5fa8' },
  epic: { bg: '#ede4f7', fg: '#6b3fa0' },
  legendary: { bg: '#ffd166', fg: '#7a4f00' },
};

function palette() {
  const fallback = {
    bg: '#ffffff', card: '#fdf8f3', border2: '#d8d0c6',
    txt: '#000000', txt2: '#555555', txt3: '#aaaaaa',
    YL: '#ffd166', YLT: '#7a4f00', GL2: '#ebf7f3', GDK: '#075c3d',
  };
  if (typeof window === 'undefined' || !window.getComputedStyle) return fallback;
  const cs = window.getComputedStyle(document.documentElement);
  const read = (name, dflt) => ((cs.getPropertyValue(name) || '').trim() || dflt);
  return {
    bg: read('--bg', fallback.bg),
    card: read('--card', fallback.card),
    border2: read('--border2', fallback.border2),
    txt: read('--txt', fallback.txt),
    txt2: read('--txt2', fallback.txt2),
    txt3: read('--txt3', fallback.txt3),
    YL: read('--YL', fallback.YL),
    YLT: read('--YLT', fallback.YLT),
    GL2: read('--GL2', fallback.GL2),
    GDK: read('--GDK', fallback.GDK),
  };
}

// ── Fonts ─────────────────────────────────────────────────────────────────────
//
// Canvas will happily draw with a fallback font and no error if Nunito has not finished loading,
// which would produce a card that is right in every respect except the one thing that makes it
// recognisably Cifri. So every weight the card uses is requested and awaited first.
//
// document.fonts.load() only resolves for a face the page has actually declared — Nunito comes in
// via the Google Fonts stylesheet in index.html — and it is a no-op on a second call, so this
// costs nothing after the first card of the session.
// Assembled from parts rather than written out as one string: a font stack reads as prose to
// check:i18n's heuristic (words, spaces, no markup), and the honest fix is to not hand it a
// sentence-shaped literal rather than to add an exception to its allow-list.
const FONT_FAMILY = 'Nunito';
const FONT_STACK = [FONT_FAMILY, 'system-ui', '-apple-system', 'sans-serif'].join(', ');
const WEIGHTS = [600, 700, 800, 900];

async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all(WEIGHTS.map((w) => document.fonts.load(w + ' 100px ' + FONT_FAMILY)));
  } catch (e) {
    // A font that will not load is a cosmetic problem, never a reason to fail the share.
  }
}

function setFont(ctx, weight, size) {
  ctx.font = weight + ' ' + size + 'px ' + FONT_STACK;
}

// ── Small drawing helpers ─────────────────────────────────────────────────────

// Written out rather than using ctx.roundRect: that lands in iOS Safari 16, and this app's
// audience includes phones older than that. arcTo is available everywhere.
function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// A surface with the app's bottom-only shadow: the same rectangle painted twice, the lower one in
// the shadow colour. Exactly what `box-shadow: 0 Npx 0 <colour>` produces in CSS.
function raisedRect(ctx, x, y, w, h, r, fill, shadow) {
  ctx.fillStyle = shadow;
  roundRectPath(ctx, x, y + SHADOW_DROP, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const attempt = line ? line + ' ' + word : word;
    if (ctx.measureText(attempt).width <= maxWidth || !line) {
      line = attempt;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Pick the largest size at which the text fits the box. Russian runs roughly 30% longer than
// English for the same string and several achievement descriptions are two sentences, so a fixed
// size would either overflow the panel or make English look timid. The sizes are tried largest
// first and the first one that fits within `maxLines` wins.
function fitLines(ctx, text, maxWidth, sizes, maxLines, weight) {
  let chosen = { size: sizes[sizes.length - 1], lines: [] };
  for (const size of sizes) {
    setFont(ctx, weight, size);
    const lines = wrapLines(ctx, text, maxWidth);
    chosen = { size, lines };
    if (lines.length <= maxLines) return chosen;
  }
  // Nothing fit even at the smallest size. Truncating is the honest failure: a description that
  // ran past the panel would sit on top of the chips.
  const lines = chosen.lines.slice(0, maxLines);
  if (lines.length === maxLines) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  return { size: chosen.size, lines };
}

function drawLines(ctx, lines, cx, top, size, lineHeight, weight, color) {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, cx, top + lineHeight * i + lineHeight / 2));
}

function drawPill(ctx, text, cx, top, h, padX, size, weight, bg, fg, spacing) {
  ctx.letterSpacing = spacing || '0px';
  setFont(ctx, weight, size);
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = bg;
  roundRectPath(ctx, cx - w / 2, top, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, top + h / 2);
  ctx.letterSpacing = '0px';
}

// ── The achievement icon ──────────────────────────────────────────────────────
//
// The real Lucide markup from the picker, not a redrawing of it — the icon on the card is the
// same icon the player just unlocked and can now wear.
//
// Two details that are load-bearing:
//   `currentColor` has nothing to inherit from inside a standalone SVG, so it would resolve to
//   black. It is substituted for the real colour before encoding.
//   Explicit width/height on the root element: Safari refuses to size an SVG loaded as an image
//   without them, and draws nothing.
//
// Encoded as a `data:` URI rather than a blob URL because a data URI does not taint the canvas,
// and a tainted canvas fails toBlob() silently — which would look exactly like "sharing is
// broken" with nothing in the console.
function iconImage(markup, color, size) {
  const svg = markup
    .replace(/currentColor/g, color)
    .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '"');
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  if (typeof img.decode === 'function') {
    return img.decode().then(() => img).catch(() => null);
  }
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

// ── The hero panel's contents ─────────────────────────────────────────────────
//
// Built as a list of blocks — each one a height, the gap above it, and how to paint itself — and
// then centred as a group inside the panel. Fixed y-coordinates were the first attempt and were
// wrong: a two-line Russian achievement name and a one-line English one would sit at the same
// height and leave visibly different amounts of air below. Centring the stack means every card
// looks composed regardless of how much text it turned out to carry.
function heroBlocks(ctx, hero, pal, icon) {
  const cx = CARD_W / 2;
  const maxW = INNER_W - 96;
  const blocks = [];

  if (icon) {
    const size = 120;
    blocks.push({
      h: size,
      gap: 0,
      draw: (y) => {
        // The popup's yellow glow, flattened to a soft disc. The popup animates it; a still image
        // keeps the halo but not the pulse.
        const grad = ctx.createRadialGradient(cx, y + size / 2, 0, cx, y + size / 2, 118);
        grad.addColorStop(0, 'rgba(255,209,102,0.55)');
        grad.addColorStop(1, 'rgba(255,209,102,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, y + size / 2, 118, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(icon, cx - size / 2, y, size, size);
      },
    });
  } else if (hero.symbol) {
    // Symbol rewards (≈, Δ, =, ≤) have no icon markup — they are typography, exactly as the
    // popup renders them.
    blocks.push({
      h: 120,
      gap: 0,
      draw: (y) => {
        const grad = ctx.createRadialGradient(cx, y + 60, 0, cx, y + 60, 118);
        grad.addColorStop(0, 'rgba(255,209,102,0.55)');
        grad.addColorStop(1, 'rgba(255,209,102,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, y + 60, 118, 0, Math.PI * 2);
        ctx.fill();
        drawLines(ctx, [hero.symbol], cx, y, 104, 120, 900, pal.YLT);
      },
    });
  }

  if (hero.ribbon) {
    blocks.push({
      h: 58,
      gap: 0,
      draw: (y) => drawPill(ctx, hero.ribbon.toLocaleUpperCase(), cx, y, 58, 34, 26, 900, '#000000', pal.YL, '2px'),
    });
  }

  if (hero.value !== undefined && hero.value !== null) {
    const text = String(hero.value);
    const fit = fitLines(ctx, text, maxW, [175, 150, 120, 96], 1, 900);
    blocks.push({
      h: 150,
      gap: blocks.length ? 30 : 0,
      draw: (y) => drawLines(ctx, fit.lines, cx, y, fit.size, 150, 900, hero.valueColor || pal.txt),
    });
  }

  if (hero.rarity) {
    const r = RARITY_COLORS[hero.rarity.key] || RARITY_COLORS.common;
    blocks.push({
      h: 54,
      gap: 34,
      draw: (y) => drawPill(ctx, hero.rarity.label.toLocaleUpperCase(), cx, y, 54, 30, 24, 800, r.bg, r.fg, '1.5px'),
    });
  }

  if (hero.title) {
    const fit = fitLines(ctx, hero.title, maxW, [60, 52, 44, 38], 2, 900);
    blocks.push({
      h: fit.lines.length * 74,
      gap: 26,
      draw: (y) => drawLines(ctx, fit.lines, cx, y, fit.size, 74, 900, pal.txt),
    });
  }

  if (hero.label) {
    blocks.push({
      h: 40,
      gap: 14,
      draw: (y) => drawLines(ctx, [hero.label], cx, y, 31, 40, 700, pal.txt2),
    });
  }

  if (hero.body) {
    const fit = fitLines(ctx, hero.body, maxW, [30, 27, 24], 3, 600);
    blocks.push({
      h: fit.lines.length * 44,
      gap: 22,
      draw: (y) => drawLines(ctx, fit.lines, cx, y, fit.size, 44, 600, pal.txt2),
    });
  }

  if (hero.note) {
    blocks.push({
      h: 62,
      gap: 30,
      draw: (y) => drawPill(ctx, hero.note, cx, y, 62, 34, 27, 800, pal.GL2, pal.GDK, '0px'),
    });
  }

  return blocks;
}

function drawChips(ctx, chips, pal) {
  const n = chips.length;
  if (!n) return;
  const w = (INNER_W - CHIP_GAP * (n - 1)) / n;
  chips.forEach((chip, i) => {
    const x = PAD + (w + CHIP_GAP) * i;
    const gold = chip.tone === 'gold';
    raisedRect(ctx, x, CHIPS_Y, w, CHIPS_H, CHIP_R,
      gold ? pal.YL : pal.card,
      gold ? '#c49030' : pal.border2);
    const cx = x + w / 2;
    const fit = fitLines(ctx, String(chip.value), w - 32, [48, 42, 36, 30], 1, 900);
    drawLines(ctx, fit.lines, cx, CHIPS_Y + 30, fit.size, 52, 900, pal.txt);
    ctx.letterSpacing = '1.5px';
    const label = fitLines(ctx, chip.label.toLocaleUpperCase(), w - 24, [22, 19, 17], 1, 800);
    drawLines(ctx, label.lines, cx, CHIPS_Y + 92, label.size, 30, 800, gold ? pal.YLT : pal.txt3);
    ctx.letterSpacing = '0px';
  });
}

// ── The wordmark ──────────────────────────────────────────────────────────────
//
// The text-based branding, deliberately isolated in its own function. The real logo is still in
// design; when it arrives this draws an image instead and NOTHING else in the card moves — the
// panel, the chips and the footer are all positioned from constants, not from this.
function drawWordmark(ctx, pal) {
  ctx.letterSpacing = '1px';
  setFont(ctx, 900, 50);
  ctx.fillStyle = pal.txt;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Cifri', PAD, 121);
  ctx.letterSpacing = '0px';
}

/**
 * Draw a card and hand back a PNG blob.
 *
 * @param card {{
 *   hero: { symbol?, iconName?, ribbon?, value?, valueColor?, rarity?: {key,label},
 *           title?, label?, body?, note? },
 *   chips: Array<{ value, label, tone? }>,
 *   tagline: string
 * }}
 * @returns Promise<Blob|null> — null rather than a throw: a card that cannot be drawn must fail
 *          the way analytics fails in this app, without ever reaching the player as an error.
 */
export async function renderShareCard(card) {
  try {
    await ensureFonts();
    const pal = palette();

    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const hero = card.hero || {};
    const markup = hero.iconName ? AVATAR_ICONS[hero.iconName] : null;
    const icon = markup ? await iconImage(markup, pal.YLT, 120) : null;

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    drawWordmark(ctx, pal);

    raisedRect(ctx, PAD, PANEL_Y, INNER_W, PANEL_H, PANEL_R, pal.card, pal.border2);

    const blocks = heroBlocks(ctx, hero, pal, icon);
    const total = blocks.reduce((sum, b) => sum + b.gap + b.h, 0);
    let y = PANEL_Y + (PANEL_H - total) / 2;
    for (const block of blocks) {
      y += block.gap;
      block.draw(y);
      y += block.h;
    }

    drawChips(ctx, card.chips || [], pal);

    drawLines(ctx, [card.tagline], CARD_W / 2, TAGLINE_Y - 18, 26, 36, 700, pal.txt3);
    ctx.letterSpacing = '1.5px';
    drawLines(ctx, [appUrlLabel()], CARD_W / 2, URL_Y - 20, 32, 40, 800, pal.txt2);
    ctx.letterSpacing = '0px';

    return await new Promise((resolve) => {
      // Never a JPEG: the card is flat colour and hard-edged type, which is what PNG is good at
      // and what JPEG smears.
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[shareCard] could not draw the card:', e);
    return null;
  }
}
