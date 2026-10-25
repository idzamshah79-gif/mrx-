import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

const isConfigured = 
  Boolean(supabaseUrl) && 
  Boolean(supabaseAnonKey) && 
  !supabaseUrl.includes("your-project-id") && 
  !supabaseAnonKey.startsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...");

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return isConfigured;
}

export async function supabaseSignIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function supabaseSignUp(email: string, password: string, displayName?: string) {
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split("@")[0],
        username: displayName ? displayName.toLowerCase().replace(/\s+/g, "_") : email.split("@")[0],
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function supabaseSignOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSupabaseUser() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
