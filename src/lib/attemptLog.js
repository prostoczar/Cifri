// Silent per-question attempt logging.
//
// Nothing in this file is allowed to affect the game. Every entry point swallows its own
// errors: if logging breaks, the player answers the next question and never finds out.
//
// The route a single answer takes:
//   1. recordAttempt()  — held in memory, no network, no storage. Called mid-question.
//   2. endSession()     — at game end, the whole sitting is stamped with whether it counted
//                         and moved into the outbox in localStorage.
//   3. flushOutbox()    — uploads the outbox if there is an account to upload it to.
//
// Splitting 1 from 2 is what lets `is_real` be correct. Whether a run counts for the day is
// only knowable once it is over, so attempts are collected raw and labelled afterwards, in
// one place, rather than guessed at per question.
//
// A guest has no account, so step 3 does nothing and the outbox simply accumulates. It is
// uploaded in full the moment they sign up, which is why the pre-account period is not lost.
//
// Every queued row also remembers WHOSE it is, which matters more than it sounds. Attempts can
// sit unsent (offline, a failed request), and without an owner the next person to log in on that
// device would inherit them. See setLogOwner below.

import { supabase } from './supabaseClient.js';
import { dayKey } from '../store/dates.js';

const OUTBOX_KEY = 'cifri_attempt_outbox_v1';

// A guest could in principle play for months. The cap bounds how much localStorage this can
// ever occupy; past it the OLDEST attempts are dropped, because recent play is the more useful
// history to carry onto a new account.
const GUEST_CAP = 2000;

// Postgres accepts large inserts happily, but a phone on a weak connection does not. Splitting
// keeps any single request small enough to survive a bad signal.
const BATCH_SIZE = 250;

// Must match the CHECK constraints in the migration exactly. A row that violates a constraint
// does not fail alone — it fails the entire batch it travels in — so anything unrecognised is
// dropped here rather than being allowed to take good rows down with it.
const OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division', 'percentage'];
const MODES = ['challenge', 'braining', 'practice'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// crypto.randomUUID() only exists in a secure context, and the app is tested over plain http on
// a LAN address from a phone — where it is undefined. These ids only group rows together, so a
// Math.random fallback is entirely adequate for what they are for.
function uuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Attempts for sittings that are still in progress. Deliberately not persisted: a game the
// player abandoned by closing the app was never finished, so it has no is_real answer and
// nothing to record.
let buffer = [];

// The account attempts are currently being made under, or null for a guest. Kept here rather
// than read from the session at upload time, because by then the player may have signed out and
// someone else may have signed in — and these rows must follow the person who earned them.
let currentOwner = null;

export function setLogOwner(userId) {
  currentOwner = userId || null;
}

function readOutbox() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeOutbox(rows) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows.slice(-GUEST_CAP)));
  } catch (e) {
    /* storage full or unavailable — the game carries on regardless */
  }
}

// Rejects anything that would be refused by the database, so a malformed row can never poison
// a batch of good ones.
function isValid(r) {
  return (
    r &&
    MODES.indexOf(r.mode) !== -1 &&
    (r.difficulty === null || DIFFICULTIES.indexOf(r.difficulty) !== -1) &&
    OPERATIONS.indexOf(r.operation) !== -1 &&
    Number.isFinite(r.time_ms) && r.time_ms >= 0 &&
    typeof r.is_correct === 'boolean' &&
    (r.digits === null || (Number.isInteger(r.digits) && r.digits >= 1 && r.digits <= 15)) &&
    (r.terms === null || (Number.isInteger(r.terms) && r.terms >= 1 && r.terms <= 12))
  );
}

// ── Called by the game hooks ───────────────────────────────────────────────────

export function startSession() {
  return uuid();
}

// One answered question. `mode` and `difficulty` describe the sitting; `isReal` is NOT passed
// here because it is not yet known — see endSession below.
export function recordAttempt({ sessionId, mode, difficulty, operation, digits, terms, timeMs, isCorrect }) {
  try {
    const clamp = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
    buffer.push({
      // Minted once, here, and never regenerated. This is what makes a repeat upload a no-op:
      // the database rejects a client_id it has already stored for this player.
      client_id: uuid(),
      session_id: sessionId,
      mode,
      difficulty: DIFFICULTIES.indexOf(difficulty) !== -1 ? difficulty : null,
      // Braining names its operations 'Addition', 'Division' and so on; the rest of the app uses
      // lower case. Normalised here so one operation is one value across every mode.
      operation: String(operation || '').toLowerCase(),
      digits: clamp(digits, 1, 15),
      terms: clamp(terms, 1, 12),
      // Sub-millisecond precision is meaningless for a person tapping a keypad, and rounding
      // keeps the column an honest integer.
      time_ms: Math.max(0, Math.round(timeMs)),
      is_correct: !!isCorrect,
      answered_at: new Date().toISOString(),
      day: dayKey(),
      is_real: false, // provisional — stamped for real by endSession()
    });
  } catch (e) {
    /* never let logging interrupt a game */
  }
}

// The sitting is over and it is now known whether it counted. Stamp every attempt from it,
// move them to the outbox, and try to send.
export function endSession(sessionId, { isReal }) {
  try {
    const mine = buffer.filter((r) => r.session_id === sessionId);
    buffer = buffer.filter((r) => r.session_id !== sessionId);
    if (!mine.length) return;
    for (const r of mine) {
      r.is_real = !!isReal;
      r.owner = currentOwner; // null while a guest — such rows are adopted by the account at signup
    }
    writeOutbox(readOutbox().concat(mine.filter(isValid)));
    flushOutbox();
  } catch (e) {
    /* as above */
  }
}

// A game abandoned mid-way. The reference app discards quit sessions entirely, so their
// attempts are discarded too rather than being logged as a partial run.
export function discardSession(sessionId) {
  buffer = buffer.filter((r) => r.session_id !== sessionId);
}

// ── Uploading ──────────────────────────────────────────────────────────────────

// Stops this module racing itself. It is only an optimisation — it saves redundant requests but
// guarantees nothing, because a second tab has its own copy of it. Correctness comes from the
// unique index the upsert below relies on, not from here.
let flushing = false;

// Safe to call at any time. Does nothing without an account, which is exactly what makes the
// guest case work: attempts pile up in the outbox and this becomes a no-op until signup.
export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data && data.session;
    if (!session) return;

    const all = readOutbox();
    if (!all.length) return;

    // Only this account's rows, plus guest rows (owner null), which signing up adopts. Anything
    // belonging to a DIFFERENT account stays queued untouched until that account signs back in —
    // it must never be attributed to whoever happens to be logged in now.
    const uid = session.user.id;
    const isMine = (r) => !r.owner || r.owner === uid;
    let pending = all.filter(isMine);
    const notMine = all.filter((r) => !isMine(r));
    if (!pending.length) return;

    while (pending.length) {
      const batch = pending.slice(0, BATCH_SIZE);
      // `owner` is bookkeeping for this device only and is not a column on the table.
      const rows = batch.map(({ owner, ...r }) => ({ ...r, user_id: uid }));
      // Upsert-ignore rather than insert. Rows stay queued until the send is CONFIRMED, so a
      // request that succeeded but whose response was lost gets retried — and must land once,
      // not twice. Postgres discards the repeat against the (user_id, client_id) unique index.
      const { error } = await supabase
        .from('question_attempts')
        .upsert(rows, { onConflict: 'user_id,client_id', ignoreDuplicates: true });

      if (error) {
        // A network or auth failure is temporary: leave everything in the outbox and try again
        // after the next game. A constraint or type error never will be — retrying it forever
        // would wedge the outbox and block every good row queued behind it, so that batch is
        // dropped and the rest carry on.
        const transient = !error.code || error.code === 'PGRST301' || /fetch|network/i.test(error.message || '');
        if (transient) return;
        console.warn('[attemptLog] dropping %d unsendable attempt(s):', batch.length, error.message);
      }

      pending = pending.slice(batch.length);
      writeOutbox(notMine.concat(pending));
    }
  } catch (e) {
    /* offline, or storage unavailable — everything stays queued */
  } finally {
    flushing = false;
  }
}

// Exposed for the verification script, so a test can confirm what is waiting to be sent.
export function outboxSize() {
  return readOutbox().length;
}
