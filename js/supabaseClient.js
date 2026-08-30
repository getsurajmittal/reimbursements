// Fill these in after creating your Supabase project:
// Dashboard -> Project Settings -> API -> "Project URL" and "anon public" key.
// The anon key is safe to expose in client-side code - it's meant to be
// public; all real access control happens via the Row Level Security
// policies in supabase/schema.sql.

const SUPABASE_URL = 'https://hctkhukcolalzsrycfdr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjdGtodWtjb2xhbHpzcnljZmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDkzNDcsImV4cCI6MjEwMjI4NTM0N30.vaF4Q3l7GpDzhZiA6UlUgV0OpL1jiNsY5k9sIvGncPk';

if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
  console.warn('supabaseClient.js: fill in SUPABASE_URL and SUPABASE_ANON_KEY before deploying.');
}

// `supabase` is the global the supabase-js CDN bundle defines; index.html loads
// that classic script before this module, so it's ready by the time we run.
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
