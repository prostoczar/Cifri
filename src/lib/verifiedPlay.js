// Talking to the verification backend, without the game ever noticing.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE RULE THIS WHOLE FILE EXISTS TO KEEP: the game never waits for the network.
//
// Not at the start, not at the end, not for a retry. Every function here can fail, time out, or
// be called with no account at all, and every one of them answers `null` rather than throwing.
// The caller's job is to carry on regardless — and because `null` is the same answer as "you are
// a guest", the offline path and the guest path are the same path, which means the common case
// keeps the rare case honest instead of the other way round.
//
// A run that cannot reach the server is still played, still scored, still recorded in
// localStorage, still earns achievements and still moves the streak. The only thing it does not
// do is become a competitive record. Nothing about that is visible to the player, and nothing
// about it is a penalty — see the note on daily_results vs verified_daily_results in
// migration 0007.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabaseClient.js';
import { dayKey } from '../store/dates.js';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// How long to wait for a set before giving up on it.
//
// Tied to the countdown, which is four 800ms steps — see CountdownScreen. There is no point
// waiting longer than the cover we have, because the decision to play verified or local is taken
// the moment the countdown ends and is never revisited. A reply arriving at 3.5 seconds is a
// reply about a game that has already started.
const ISSUE_TIMEOUT_MS = 3000;

// Submission is not racing anything — the result screen is already on the player's phone — so it
// can afford to be patient with a bad connection.
const SUBMIT_TIMEOUT_MS = 10000;

// Two retries, then silence. Deliberately short, and the reason is worth stating because it is
// the one place this design gives something up:
//
// A question set expires fifteen minutes after it is issued. A submission that could not be sent
// inside that window will NEVER be accepted, so persisting it to localStorage the way the attempt
// log does would build an outbox that can only ever fail — the appearance of eventual delivery
// with none of the substance. The expiry is what stops sets being hoarded and solved at leisure;
// this is what that protection costs, and it is worth it.
const RETRY_DELAYS_MS = [2000, 8000];

// The player's token, or null if they are a guest. Read fresh each time rather than cached: a
// session can expire, refresh, or belong to somebody else by the time the next game ends.
async function accessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// One call, with a deadline. Returns { status, body } or null if it never completed.
//
// The AbortController is not a nicety. Without it a request against a captive-portal wifi can
// hang indefinitely, and a hanging issue request would leave a retry chain alive long after the
// game it belonged to had finished.
async function callFunction(name, body, { token, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let parsed = null;
    try { parsed = await res.json(); } catch { /* empty or malformed body */ }
    return { status: res.status, body: parsed };
  } catch {
    // Aborted, offline, DNS failure, CORS — all the same answer to the caller.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Getting a set ─────────────────────────────────────────────────────────────

// Asks for a question set for `difficulty`. Returns { setId, seed, setSize } or null.
//
// Null is not an error state and needs no handling beyond "play locally": guests get it, players
// with no signal get it, and a player whose request was simply slower than the countdown gets it.
export async function issueChallengeSet(difficulty) {
  const token = await accessToken();
  if (!token) return null; // a guest, which is not a failure

  const res = await callFunction(
    'issue-question-set',
    { mode: 'challenge', difficulty, day: dayKey() },
    { token, timeoutMs: ISSUE_TIMEOUT_MS }
  );
  if (!res || res.status !== 200 || !res.body?.setId) {
    // Rate limiting lands here too, and is treated exactly like being offline. A player who has
    // somehow asked for ten sets in a minute is not shown an error; they just play an unverified
    // run, which is precisely what the limit is for.
    if (res && res.status !== 200) {
      console.info('[verifiedPlay] no set issued (%d %s) — playing unverified', res.status, res.body?.error ?? '');
    }
    return null;
  }
  return { setId: res.body.setId, seed: res.body.seed, setSize: res.body.setSize };
}

// ── Sending a finished run ────────────────────────────────────────────────────

// Submits the answers and returns the server's verdict, or null if it never got through.
//
// Retrying is safe, and that is a property of the server rather than a hope about the network:
// question_sets.result stores the verdict of the first submission, so a retry after a lost
// response is answered with the original decision instead of being refused as a replay.
export async function submitChallengeAttempt({ setId, answers }) {
  if (!setId || !answers || !answers.length) return null;

  for (let attempt = 0; ; attempt++) {
    const token = await accessToken();
    if (!token) return null; // signed out mid-game — nothing to submit against

    const res = await callFunction(
      'submit-attempt',
      { setId, answers },
      { token, timeoutMs: SUBMIT_TIMEOUT_MS }
    );

    // A verdict, of either kind. 422 means the server looked at this run and declined it, which
    // is an answer and not a failure to deliver — retrying would produce the same answer.
    if (res && res.body) {
      if (res.body.ok === false) {
        console.warn('[verifiedPlay] run not verified: %s', res.body.code);
      }
      return res.body;
    }

    if (attempt >= RETRY_DELAYS_MS.length) {
      console.info('[verifiedPlay] could not reach the server — the run stands locally, unverified');
      return null;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}
