import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The app's one real client. It persists its session, refreshes tokens, and broadcasts auth
// events — everything a signed-in player needs, and everything that makes it the wrong tool for
// the job below.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── The probe client ───────────────────────────────────────────────────────────
//
// Signup sometimes has to ANSWER A QUESTION about an email rather than sign anybody in: "is this
// address already a finished account, or the wreckage of one whose profile never got created?"
// The only way to ask is to try the password.
//
// Doing that on the client above is what destroyed players' progress. A successful
// signInWithPassword there is indistinguishable from a real login: it stores a session, and it
// fires SIGNED_IN, which the store answers by downloading that account and letting the server's
// copy win — over the guest progress the person was in the middle of saving. The signup then
// failed with "email already in use", but the local data was already gone.
//
// This client exists so the question can be asked without anything hearing the answer. It is a
// second, independent instance: its own in-memory auth state, its own subscribers (none), no
// storage. A sign-in here writes nothing, notifies nobody, and evaporates on reload.
//
// It is created lazily because the overwhelmingly common signup never needs it at all.
let probe = null;
export function probeClient() {
  if (!probe) {
    probe = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        // Given its own key even though it persists nothing. Two clients sharing a storage key is
        // a configuration supabase-js warns about, and the warning is fair: the guarantee wanted
        // here is that these two never meet, and leaving them pointed at the same slot leaves that
        // resting on `persistSession: false` alone.
        storageKey: 'cifri-signup-probe',
      },
    });
  }
  return probe;
}
