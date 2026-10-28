import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Expo inlines EXPO_PUBLIC_* at bundle time, but ONLY for literal
// `process.env.EXPO_PUBLIC_X` accesses. Do not destructure or index dynamically.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

function looksLikeUrl(value: string | undefined): value is string {
  return !!value && /^https?:\/\//i.test(value);
}

/**
 * `app.json` uses `web.output: "server"`, so this module is also evaluated in Node during
 * server rendering, where AsyncStorage's web implementation (localStorage) does not
 * exist. There is nobody to sign in on the server, so skip session persistence there.
 */
const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';

function createBackendClient(): SupabaseClient | null {
  if (!looksLikeUrl(url) || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      storage: isServerRender ? undefined : AsyncStorage,
      persistSession: !isServerRender,
      autoRefreshToken: !isServerRender,
      detectSessionInUrl: false, // React Native / Expo Router: no OAuth redirect in window.location
    },
  });
}

/** The Supabase client, or `null` when the env vars are missing (offline demo mode). */
export const supabase: SupabaseClient | null = createBackendClient();

/** `true` when a backend is configured. When `false`, the app runs fully offline. */
export const isBackendConfigured: boolean = supabase !== null;

/** For code paths that only make sense with a backend (admin page, sign-in). */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Backend not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
    );
  }
  return supabase;
}

// Only refresh tokens while the app is in the foreground (Supabase's React Native guidance).
if (supabase && !isServerRender && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
