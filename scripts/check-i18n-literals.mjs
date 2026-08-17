// Is there any user-facing text that never reaches the translation table?
//
// This is the check that was missing. The existing key-parity discipline proves every key in `en`
// has a twin in `ru`, and it was perfectly clean — 321 keys, zero missing, zero orphans — while
// about twenty strings were being rendered to players in English regardless of their language
// setting, including the whole Braining result screen. Parity cannot see a string that was never
// made a key. That is not a gap in how carefully it was run; it is outside what it measures.
//
// So this looks at the other side: every string literal in the app, and whether it looks like
// something a person reads. It replaces a throwaway version written during the 2026-08-14 audit.
//
// Run it with:  npm run check:i18n
//
// ── HOW IT DECIDES ───────────────────────────────────────────────────────────────────────────
//
// It parses a real AST rather than grepping. That matters more than it sounds: almost everything
// that makes a string NOT user-facing is a fact about where the string sits, not about the string.
// `t('save')` and `alt.textContent = 'save'` contain the same literal and only one is a bug. A
// regex has to guess; the AST knows.
//
// Two questions, both of which must be yes:
//
//   1. Does it LOOK like prose?   Words with spaces between them, or a sentence ending. This is a
//                                 heuristic and it is the weaker half — see PROSE below.
//   2. Is it in a position where  Not a t() key, not an import, not a className, not an object key,
//      a player could see it?     not a console call, not a comparison against a literal.
//
// ── WHAT IT DELIBERATELY DOES NOT CATCH ──────────────────────────────────────────────────────
//
// Stated plainly, because a check whose blind spots are unknown is worse than one whose are.
//
//   - Single-word literals. 'Submit' as a button label would pass. Flagging every one-word string
//     would flag several hundred class names, operation keys and action types, and a check that
//     cries wolf gets muted. This is the real hole.
//   - Unit letters, e.g. `n + 'm ' + s + 's'`. Two of these were live bugs on the Braining screens
//     (brFmtSec, fmtBrCountdown). Both are fixed, and neither would be caught here: 'm ' is one
//     character and a space. There is no heuristic that separates it from a CSS unit.
//   - Anything assembled at runtime from translated parts, which is fine, or from untranslated
//     ones, which is not.
//
// So this catches the sentence-shaped mistakes — which is what all twenty of the audit's findings
// were — and does not pretend to be exhaustive.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { parseAst } from 'rolldown/parseAst';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

// ── Files exempt from the scan, each for a stated reason ──────────────────────
const EXEMPT_FILES = new Set([
  // The table itself. Every string in it is a translation.
  'src/i18n_data.js',
  // The one deliberate exception in the project. CLAUDE.md: the achievement catalogue keeps both
  // languages on the row rather than in the table, so a row can be diffed against the source
  // spreadsheet. Both languages are present, so nothing here is untranslated — it is just not in
  // i18n_data.js. The catalogue's own check script covers it instead.
  'src/store/achievements.js',
  // The trick content, same shape as the catalogue: every entry carries en and ru side by side.
  'src/store/tricksData.js',
]);

// ── Individual strings that are prose-shaped but not user-facing ──────────────
//
// Kept as a short explicit list rather than a clever rule, so that adding to it is a visible
// decision. If this list starts growing, the heuristic is wrong and should be fixed instead.
const ALLOW = new Set([
  // Feature-detection and platform strings that happen to contain spaces.
  'Add to Home Screen',
]);

// Keys whose two translations legitimately use different placeholders.
//
// Normally a placeholder present in one language and missing in the other is a bug — the value
// renders with a literal "{{n}}" in it, or drops a word. These are the exceptions, and each one is a
// real translation decision rather than an oversight, so it is recorded here rather than weakening
// the rule for everybody.
const PLACEHOLDER_DIVERGENCE = new Map([
  // English counts a noun — "the average of 3 attempts" — and needs {{unit}} to carry the plural
  // form from attemptWord(). Russian rephrases so nothing is counted: "среднее всех попыток.
  // Сегодня их: 3". That is deliberate. A Russian counted noun takes three forms depending on the
  // last digits (1 попытка / 2 попытки / 5 попыток), and the sentence avoids the problem instead of
  // solving it, which is the better translation.
  ['mdl_today_body2', 'Russian rephrases to avoid a counted noun, so it needs no {{unit}}'],
]);

// ── Is this prose? ────────────────────────────────────────────────────────────
//
// Every rule below exists because a real string in this codebase demanded it. The SELF-TEST at the
// bottom of this file pins both directions: the audit's twenty actual findings must all be accepted,
// and a sample of the app's real non-copy strings must all be rejected. Loosen a rule and the
// self-test says which finding it just stopped catching.
export function looksLikeProse(raw) {
  const s = String(raw).trim();
  if (s.length < 4 || s.length > 400) return false;
  if (ALLOW.has(s)) return false;

  // Markup being assembled by concatenation: '<svg width="' and the '" height="' that follows it.
  // The second has no angle bracket at all — an attribute assignment is the only tell.
  if (/<[a-zA-Z/!]/.test(s)) return false;
  if (/=["']/.test(s)) return false;

  // CSS: a colour, a selector, a function, a transition shorthand, a bare measurement.
  if (/^[#.]/.test(s)) return false;
  if (/^(var|calc|rgba?|hsla?|url|translate|scale|rotate|linear-gradient|cubic-bezier)\(/.test(s)) return false;
  if (/cubic-bezier\(|\b(ease-in-out|ease-in|ease-out|ease|linear)\b\s*$/.test(s)) return false;
  if (/^[a-z-]+\s+[\d.]+m?s\b/.test(s)) return false;
  if (/^[\d\s.,%pxremvhwdeg+-]+$/i.test(s)) return false;

  // URLs, paths, mime types.
  if (/^https?:|^\/|^\.\/|^\.\.\//.test(s)) return false;
  if (/^[a-z-]+\/[a-z\-+.]+$/i.test(s)) return false;

  // A single CSS declaration wrapped in parentheses — a media query, e.g.
  // '(prefers-color-scheme: dark)'. It ends in a colon-separated pair, which the label rule below
  // would otherwise read as a caption.
  if (/^\([a-z-]+\s*:\s*[a-z0-9-]+\)$/.test(s)) return false;

  // SCREAMING_SNAKE action types.
  if (/^[A-Z0-9_ ]+$/.test(s)) return false;

  // A fragment of a CSS animation or transition shorthand, e.g. the 's forwards' left over from
  // `confettiFall ${d}s ease-in ${delay}s forwards`. Nothing but CSS keywords in it.
  const CSS_KEYWORDS = new Set(['forwards', 'backwards', 'infinite', 'alternate', 'both', 'normal',
    'reverse', 'paused', 'running', 'ease', 'linear', 'none', 'auto', 'inherit', 'initial', 'unset']);

  // A comma-separated list of snake_case identifiers — a Supabase column selection.
  if (/^[a-z_][a-z0-9_]*(\s*,\s*[a-z_][a-z0-9_]*)+$/.test(s)) return false;

  const words = s.split(/\s+/);
  // A run of letters long enough to be a word rather than an initial or a unit.
  const letterWords = words.filter((w) => /[A-Za-zА-Яа-яЁё]{2,}/.test(w));

  // Requires actual words. This is what stops " = ?" and "3 + 4 = ?" — they end in sentence
  // punctuation and have several tokens, but not one of them is a word.
  if (letterWords.length === 0) return false;

  // A space-separated list of identifiers: class names ("br-badge grn"), SVG attribute values.
  // Narrower than "is it all lowercase", because all-lowercase PROSE is exactly the bug being
  // hunted — "complete a session to see your progress" must not be excused by its case.
  //
  // Digits exclude a string from this rule. A token list does not contain numbers, and requiring
  // their absence is what lets '3 - 4 min' through: every one of its tokens is short enough to look
  // like an identifier, and it is a scale label.
  const identifierish = (w) => /[-_]/.test(w) || w.length <= 4;
  if (!/\d/.test(s) && !/[.!?…:]$/.test(s) && !/[A-ZА-ЯЁ]/.test(s)
    && words.every(identifierish)) return false;

  if (letterWords.every((w) => CSS_KEYWORDS.has(w.toLowerCase().replace(/[^a-z-]/g, '')))) return false;

  if (letterWords.length >= 2) return true;

  // One word is still copy in three shapes, all of which were live bugs:
  //
  //   a label prefix ending in a colon   'Today: ', 'Yesterday: '
  //   a sentence                         'Loading…'
  //   a unit attached to numbers         '3 – 4 min', 'Over 10 min'
  //
  // The last needs the space: it separates "3 – 4 min" from a bare identifier like 'middle', which
  // is an SVG attribute value and not something anybody reads.
  if (/:$/.test(s)) return true;
  if (/[.!?…]$/.test(s) && letterWords[0].replace(/[^A-Za-zА-Яа-яЁё]/g, '').length >= 4) return true;
  return /\s/.test(s) && letterWords[0].replace(/[^A-Za-zА-Яа-яЁё]/g, '').length >= 3;
}

// ── Walking the AST ───────────────────────────────────────────────────────────
//
// A hand-rolled walk rather than a dependency: every node is a plain object, so recursing over own
// properties visits everything, and the parent chain is what the context rules need.
function walk(node, visit, parent = null, key = null) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent, key);
    return;
  }
  if (typeof node.type === 'string') {
    visit(node, parent, key);
    parent = node;
  }
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
    walk(node[k], visit, parent, typeof node.type === 'string' ? k : key);
  }
}

// The functions whose string argument is a translation key rather than text. `t` is the table lookup
// itself; the rest are the app's small wrappers around it.
const KEY_TAKING = new Set(['t', 'tRaw', 'diffLabel', 'diffInfoText', 'opName', 'attemptWord']);

// String PREDICATES. A string being tested against is logic, not copy — the same reasoning as the
// `===` rule below, just spelled with a method call. This is how the app reads Supabase's own error
// messages (`msg.includes('invalid credentials')`), which are upstream English the app never shows.
const PREDICATES = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'test', 'match', 'search']);

// Browser and platform APIs whose string arguments are identifiers: element and attribute names,
// storage keys, event names, CSS classes, media queries.
const PLATFORM = new Set([
  'setAttribute', 'getAttribute', 'removeAttribute', 'createElementNS', 'createElement',
  'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName',
  'addEventListener', 'removeEventListener', 'dispatchEvent',
  'getItem', 'setItem', 'removeItem', 'matchMedia', 'getPropertyValue', 'setProperty',
  // classList.add / .remove / .toggle / .contains, and Map/Set membership.
  'add', 'remove', 'toggle', 'contains', 'has', 'get', 'set',
  // Separators, not copy.
  'split', 'join',
]);

// Contexts in which a prose-shaped literal is not something a player reads.
function isExemptContext(chain) {
  for (let i = chain.length - 1; i >= 0; i--) {
    const { node, parent, key } = chain[i];

    // import './x.css', export from, dynamic import
    if (parent && (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration'
      || parent.type === 'ExportAllDeclaration' || parent.type === 'ImportExpression')) return 'import';

    // An object or class KEY, not a value.
    if (parent && (parent.type === 'Property' || parent.type === 'PropertyDefinition') && key === 'key') return 'object key';

    // A t() key, or any wrapper that takes one.
    if (parent && parent.type === 'CallExpression' && key === 'arguments') {
      const callee = parent.callee;
      const name = callee && (callee.name || (callee.property && callee.property.name));
      if (KEY_TAKING.has(name)) {
        // t(lang, key) and t(key) both put the key in the first or second slot; either way the only
        // string arguments to these are keys.
        return 't() key';
      }
      // Developer-facing output and errors.
      if (callee && callee.object && callee.object.name === 'console') return 'console';
      if (PREDICATES.has(name)) return 'string predicate';
      if (PLATFORM.has(name)) return 'platform API';
      if (name === 'Error' || name === 'TypeError') return 'error message';
    }
    if (parent && parent.type === 'NewExpression' && key === 'arguments') return 'constructor arg';
    if (parent && parent.type === 'ThrowStatement') return 'throw';

    // A className or style value, or any JSX attribute that is not visible copy.
    if (parent && parent.type === 'JSXAttribute') {
      const an = parent.name && parent.name.name;
      // These ARE read by a player (or a screen reader) and must be translated.
      if (an === 'placeholder' || an === 'title' || an === 'alt' || an === 'aria-label') return null;
      return 'JSX attribute ' + an;
    }

    // Comparisons against a literal are logic, not copy.
    if (parent && parent.type === 'BinaryExpression'
      && ['===', '!==', '==', '!=', 'in', 'instanceof'].includes(parent.operator)) return 'comparison';
    if (parent && parent.type === 'SwitchCase' && key === 'test') return 'switch case';

    // A declared constant of internal identifiers, e.g. `const OPS = ['addition', ...]`.
    void node;
  }
  return null;
}

// ── The scan ──────────────────────────────────────────────────────────────────
function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...jsFiles(p)); continue; }
    if (['.js', '.jsx'].includes(extname(name))) out.push(p);
  }
  return out;
}

const findings = [];

for (const file of jsFiles(SRC)) {
  const rel = relative(ROOT, file);
  if (EXEMPT_FILES.has(rel)) continue;
  const code = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parseAst(code, { lang: 'jsx' });
  } catch (e) {
    findings.push({ rel, line: 0, text: 'could not parse: ' + e.message.split('\n')[0] });
    continue;
  }
  const lineOf = (pos) => code.slice(0, pos).split('\n').length;

  // The parent chain has to be reconstructed, since the walk only hands over the immediate parent.
  //
  // The KEY is recorded for every link, not just the innermost one. That is not tidiness: a string
  // inside `console.info('...', x ? 'a' : ' (already recorded today)')` sits under a
  // ConditionalExpression, so the console rule only fires if the walk can still see, two links up,
  // that the conditional is an ARGUMENT. Without the key the check reported that line as untranslated
  // copy — a false positive in a developer-only DEV log.
  const parents = new Map();
  const keys = new Map();
  walk(ast, (node, parent, key) => {
    if (!parent) return;
    parents.set(node, parent);
    keys.set(node, key);
  });

  const chainFor = (node) => {
    const chain = [];
    let cur = node;
    while (cur && chain.length < 16) {
      chain.unshift({ node: cur, parent: parents.get(cur) || null, key: keys.get(cur) || null });
      cur = parents.get(cur);
    }
    return chain;
  };

  walk(ast, (node, parent, key) => {
    let value = null;
    if (node.type === 'Literal' && typeof node.value === 'string') value = node.value;
    // A template literal's static chunks: `Today: ${x}` is exactly the bug this looks for.
    else if (node.type === 'TemplateElement' && node.value && typeof node.value.cooked === 'string') value = node.value.cooked;
    // Visible text sitting directly in JSX: <div>Some words</div>
    else if (node.type === 'JSXText' && node.value.trim()) value = node.value.trim();
    if (value === null) return;
    if (!looksLikeProse(value)) return;

    // JSXText has no exempt context worth checking — it is on screen by definition.
    if (node.type !== 'JSXText') {
      if (isExemptContext(chainFor(node))) return;
    }
    void parent; void key;
    findings.push({ rel, line: lineOf(node.start ?? 0), text: value });
  });
}

// ── Key parity, while we are here ─────────────────────────────────────────────
//
// Folded into this script rather than left as another throwaway. The audit ran it by hand and got a
// clean result; nothing in the repo was keeping it clean. Both halves of the i18n discipline now
// fail the build instead of being re-derived by whoever next wonders.
const i18nSrc = readFileSync(join(SRC, 'i18n_data.js'), 'utf8');
const i18nAst = parseAst(i18nSrc, { lang: 'js' });
const tables = {};
walk(i18nAst, (node) => {
  if (node.type !== 'VariableDeclarator' || !node.id || node.id.name !== 'I18N') return;
  for (const langProp of node.init.properties || []) {
    const lang = langProp.key.name || langProp.key.value;
    tables[lang] = new Map();
    for (const p of langProp.value.properties || []) {
      const k = p.key.name || p.key.value;
      tables[lang].set(k, p.value.type === 'Literal' ? p.value.value : null);
    }
  }
});

const parityProblems = [];
const en = tables.en, ru = tables.ru;
if (!en || !ru) {
  parityProblems.push('could not read both language tables out of i18n_data.js');
} else {
  for (const k of en.keys()) if (!ru.has(k)) parityProblems.push(`missing from ru: ${k}`);
  for (const k of ru.keys()) if (!en.has(k)) parityProblems.push(`orphan in ru: ${k}`);
  for (const k of en.keys()) {
    if (!ru.has(k)) continue;
    const a = en.get(k), b = ru.get(k);
    if (typeof a !== 'string' || typeof b !== 'string') continue;
    // A value identical in both languages is usually an untranslated string. Some are legitimately
    // identical — a bare placeholder, a symbol — so the test is "identical AND contains letters".
    if (a === b && /[A-Za-z]{2,}/.test(a)) parityProblems.push(`identical in both languages: ${k} = "${a}"`);
    if (/[A-Za-zА-Яа-яЁё]{2,}/.test(b) && !/[А-Яа-яЁё]/.test(b)) parityProblems.push(`no Cyrillic in ru: ${k} = "${b}"`);
    // Interpolation placeholders have to survive translation, or the value silently renders "{{n}}".
    const ph = (s) => (s.match(/\{\{\w+\}\}/g) || []).sort().join(',');
    if (ph(a) !== ph(b) && !PLACEHOLDER_DIVERGENCE.has(k)) {
      parityProblems.push(`placeholders differ: ${k} — en "${ph(a)}" vs ru "${ph(b)}"`);
    }
  }
}

// Every t() call site must resolve to a key that exists, or it renders the key name to a player.
const usedKeys = new Set();
for (const file of jsFiles(SRC)) {
  const rel = relative(ROOT, file);
  if (rel === 'src/i18n_data.js') continue;
  const code = readFileSync(file, 'utf8');
  let ast;
  try { ast = parseAst(code, { lang: 'jsx' }); } catch { continue; }
  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    const name = callee && (callee.name || (callee.property && callee.property.name));
    if (name !== 't' && name !== 'tRaw') return;
    for (const arg of node.arguments) {
      if (arg.type === 'Literal' && typeof arg.value === 'string' && arg.value !== 'en' && arg.value !== 'ru') {
        usedKeys.add(arg.value);
      }
    }
  });
}
const missingKeys = [...usedKeys].filter((k) => en && !en.has(k));

// ── The self-test ─────────────────────────────────────────────────────────────
//
// A scanner that finds nothing is indistinguishable from a scanner that looks for nothing, and this
// one will spend most of its life reporting zero. So it is asked to prove it can still see.
//
// MUST_CATCH is the audit's actual findings, transcribed verbatim from AUDIT-2026-08-14.md before
// they were fixed. If a future loosening of looksLikeProse stops accepting one of these, the check
// says which specific historical bug it would now let through.
//
// MUST_IGNORE is real non-copy from this codebase — the strings that produced false positives while
// this was being written. They are the reason each rejection rule exists.
const MUST_CATCH = [
  'brain age (practice)',
  'Completed in ',
  'Best time: ',
  ' · Brain age: ',
  'Today: ',
  'Yesterday: ',
  'Last time: ',
  'Under 3 min',
  '3 – 4 min',
  'Over 10 min',
  'Complete a session to see your progress',
  'complete a session to see your progress', // lower-cased: case must not excuse it
  'Next Braining in ',
  'This is a practice session — nothing is counted anyway.',
  'Your progress will not be saved. This would have been your first trial today — quitting means it will not count.',
  'Your first trial is already logged — this retry will not affect your record.',
];
const MUST_IGNORE = [
  'br-badge grn',
  'sc-today show',
  'text-anchor',
  'middle',
  'CHALLENGE_SESSION_COMPLETE',
  'cifri_react_v1',
  'transform .32s cubic-bezier(.32,.72,0,1)',
  'calc(11px * var(--fs-mult))',
  'var(--GDK)',
  '#3d7020',
  '100%',
  ' = ?',
  '3 + 4 = ?',
  'username, full_name, avatar',
  '<svg width="',
  'application/json',
  './store/braining.js',
  '(prefers-color-scheme: dark)',
  '" height="',
  's forwards',
  ' ease-in ',
  'confettiFall ',
];

const selfTestProblems = [];
for (const s of MUST_CATCH) {
  if (!looksLikeProse(s)) selfTestProblems.push(`no longer detected as copy: "${s}"`);
}
for (const s of MUST_IGNORE) {
  if (looksLikeProse(s)) selfTestProblems.push(`now wrongly detected as copy: "${s}"`);
}

// ── Report ────────────────────────────────────────────────────────────────────
let failed = 0;

console.log('Self-test: can this scanner still see?');
if (selfTestProblems.length) {
  failed += selfTestProblems.length;
  for (const p of selfTestProblems) console.log('FAIL  ' + p);
} else {
  console.log(`ok    all ${MUST_CATCH.length} of the audit's findings are still detected, and all ${MUST_IGNORE.length} non-copy samples still ignored`);
}

console.log('\nLiterals outside the translation table');
if (findings.length) {
  failed += findings.length;
  for (const f of findings) console.log(`FAIL  ${f.rel}:${f.line}  "${f.text}"`);
} else {
  console.log('ok    no prose-shaped literal found outside i18n_data.js');
}

console.log('\nKey parity');
if (parityProblems.length) {
  failed += parityProblems.length;
  for (const p of parityProblems) console.log('FAIL  ' + p);
} else {
  console.log(`ok    ${en ? en.size : 0} keys, both languages, all translated, placeholders intact`);
}

console.log('\nt() call sites');
if (missingKeys.length) {
  failed += missingKeys.length;
  for (const k of missingKeys) console.log(`FAIL  t('${k}') has no entry in the table`);
} else {
  console.log(`ok    all ${usedKeys.size} keys reached by a t() call exist`);
}

console.log(failed ? `\n${failed} problem(s)` : '\nall checks passed');
process.exit(failed ? 1 : 0);
