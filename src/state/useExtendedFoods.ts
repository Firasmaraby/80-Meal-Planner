import { useEffect, useSyncExternalStore } from 'react';

import { ensureExtendedLoaded, isExtendedLoaded, subscribeCatalog } from './catalog';

/**
 * Starts loading the extended food tier (once) and re-renders the caller when it has arrived,
 * so a screen that searches can re-run its search against the full library. Returns `loaded`.
 */
export function useExtendedFoods(): boolean {
  useEffect(() => {
    ensureExtendedLoaded().catch(() => {}); // offline demo without the chunk: stay on the everyday tier
  }, []);
  return useSyncExternalStore(subscribeCatalog, isExtendedLoaded, isExtendedLoaded);
}
