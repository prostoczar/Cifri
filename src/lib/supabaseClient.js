import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Connection only — no auth or data calls are made anywhere yet.
// Real usage (auth, reads/writes) is wired up in a future session.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
