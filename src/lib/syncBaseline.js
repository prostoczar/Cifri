// What this device last knew the SERVER to be holding, remembered across reloads.
//
// Without this, reconnecting after offline play destroys that play. The app treats the server as
// authoritative when it loads an account — which is correct when a second phone picks up your
// history, and catastrophic when this phone has progress the server has never seen. The two cases
// look identical at load time: local and server simply disagree. This is what tells them apart.
//
//   baseline missing            → this device has never synced with this account. The server is
//                                 the only history there is; adopt it. (First login on a phone.)
//   baseline == local state     → everything here is already uploaded, so a difference means the
//                                 server is genuinely newer. Adopt it. (Played on another device.)
//   baseline != local state     → this device has changes the server never received. Keep them
//                                 and upload. (Played offline.)
//
// Deliberately clock-free. Comparing timestamps would make this depend on a phone's clock being
// honest and on the two clocks agreeing; "did our last upload actually succeed" is something the
// device knows for certain on its own.
//
// A fingerprint is stored rather than the payload itself, so this cannot grow to rival the size
// of the state it describes. A collision would only ever restore the old behaviour for one load.

const KEY = 'cifri_sync_baseline_v1';

export function fingerprint(payload) {
  const s = JSON.stringify(payload);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  // Length is included as well as the hash: two states that differ have to collide on both.
  return s.length + ':' + h.toString(36);
}

// Called only when the server's contents are KNOWN — after a confirmed upload, or right after
// downloading. Never call it optimistically: a baseline that claims a sync which did not happen
// is exactly the bug this file exists to prevent.
export function writeBaseline(userId, payload) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId, fp: fingerprint(payload) }));
  } catch (e) {
    /* storage unavailable — worst case we fall back to trusting the server */
  }
}

// Scoped to the account. A baseline recorded for someone else's account tells us nothing about
// this one, so it reads as absent rather than being compared across accounts.
export function readBaseline(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw && raw.userId === userId ? raw.fp : null;
  } catch (e) {
    return null;
  }
}

// Dropped on sign-out. Otherwise a stale baseline would still be sitting there if the same
// account logged back in later, and any guest play in between would look like unsynced progress
// belonging to that account — which would then be uploaded over the account's real history.
export function clearBaseline() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* nothing to do */
  }
}
