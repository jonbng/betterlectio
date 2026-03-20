import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../database.types'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Custom storage adapter using browser.storage.local (not lectio.dk's localStorage)
const extensionStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await browser.storage.local.get(key);
    return (result[key] as string) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
};

let client: SupabaseClient | null = null;

export function createSupabaseClient(): SupabaseClient {
  if (client) return client;

  client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: extensionStorage,
      detectSessionInUrl: false,
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  return client;
}

export async function getSession() {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

export async function signOut() {
  const supabase = createSupabaseClient();
  await supabase.auth.signOut();
}
