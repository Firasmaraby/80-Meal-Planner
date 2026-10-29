import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface HealthState {
  /** the user turned the export on (and granted permission) */
  enabled: boolean;
  /** ISO timestamp of the last successful sync, or null */
  lastSyncedAt: string | null;
  /** message from the last failed sync, or null after a success */
  lastError: string | null;
  setEnabled: (enabled: boolean) => void;
  markSynced: (at?: string) => void;
  markError: (message: string) => void;
  clearError: () => void;
}

/**
 * Same pattern as store.ts: storage can be unavailable (private browsing, sandboxed previews), and
 * that must never stop the app from starting. Fall back to memory for the session.
 */
const memory = new Map<string, string>();
const safeStorage = {
  getItem: async (k: string) => {
    try {
      return await AsyncStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: async (k: string, v: string) => {
    memory.set(k, v);
    try {
      await AsyncStorage.setItem(k, v);
    } catch {
      /* in-memory only */
    }
  },
  removeItem: async (k: string) => {
    memory.delete(k);
    try {
      await AsyncStorage.removeItem(k);
    } catch {
      /* in-memory only */
    }
  },
};

export const useHealthStore = create<HealthState>()(
  persist(
    (set) => ({
      enabled: false,
      lastSyncedAt: null,
      lastError: null,
      setEnabled: (enabled) => set({ enabled, ...(enabled ? {} : { lastError: null }) }),
      markSynced: (at = new Date().toISOString()) => set({ lastSyncedAt: at, lastError: null }),
      markError: (lastError) => set({ lastError }),
      clearError: () => set({ lastError: null }),
    }),
    {
      name: 'eighty-health',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ enabled: s.enabled, lastSyncedAt: s.lastSyncedAt, lastError: s.lastError }),
    },
  ),
);
