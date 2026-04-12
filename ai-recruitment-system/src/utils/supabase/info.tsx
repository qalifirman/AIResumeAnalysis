// ─── Supabase connection info ─────────────────────────────────────────────────
// For Supabase CLOUD: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
// Get these from: Supabase dashboard → Settings → API

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
export const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Edge function URL — automatically derived from your project URL
// After deploying: supabase functions deploy server
export const serverFunctionUrl = `${supabaseUrl}/functions/v1/server`;
