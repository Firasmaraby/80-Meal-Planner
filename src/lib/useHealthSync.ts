/**
 * Keeps Apple Health / Health Connect in step with the food log.
 *
 * Mount `useHealthSync()` once in the root layout. While the export is switched on it watches the
 * log for today and yesterday (yesterday so a late edit, or a sync that straddles midnight, still
 * lands) and, ~3 s after the last change, replaces what Eighty wrote for any day whose log changed.
 * `syncTodayNow()` is the manual button on the Health settings screen.
 */
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { scaled } from '@/engine/calc';
import { food } from '@/state/catalog';
import { useHealthStore } from '@/state/healthStore';
import { addDays, today, useStore, type Log } from '@/state/store';

import { syncDayToHealth } from './health';
import { errorMessage, type HealthItem } from './healthMapping';

export const SYNC_DEBOUNCE_MS = 3000;

/** The log entries for one day as health items (nutrients already scaled by grams). */
export function healthItemsForDate(logs: Log[], date: string): HealthItem[] {
  const items: HealthItem[] = [];
  for (const l of logs) {
    if (l.date !== date) continue;
    const f = food(l.foodId);
    if (!f) continue;
    items.push({ id: l.id, slot: l.slot, nutrients: scaled(f, l.grams) });
  }
  return items;
}

/** Changes whenever anything that affects the day's export changes. */
function signature(logs: Log[], date: string): string {
  return logs
    .filter((l) => l.date === date)
    .map((l) => `${l.id}:${l.foodId}:${l.grams}:${l.slot ?? ''}:${l.updatedAt}`)
    .sort()
    .join('|');
}

/** Last signature written successfully per date, this session. */
const synced = new Map<string, string>();
/** Syncs run one at a time so two debounced runs can never interleave their delete + write. */
let queue: Promise<unknown> = Promise.resolve();

async function syncDatesNow(dates: string[], force: boolean): Promise<boolean> {
  const health = useHealthStore.getState();
  let ok = true;
  for (const date of dates) {
    const logs = useStore.getState().logs;
    const sig = signature(logs, date);
    if (!force && synced.get(date) === sig) continue;
    try {
      await syncDayToHealth(date, healthItemsForDate(logs, date));
      synced.set(date, sig);
      health.markSynced();
    } catch (e) {
      ok = false;
      health.markError(errorMessage(e));
    }
  }
  return ok;
}

/** Queue a sync of the given dates. Resolves true when every date synced (or was already current). */
export function syncDates(dates: string[], opts: { force?: boolean } = {}): Promise<boolean> {
  const run = queue.then(() => syncDatesNow(dates, !!opts.force));
  queue = run.catch(() => undefined);
  return run;
}

/** Manual "Sync today now": always rewrites today, even if nothing changed. */
export function syncTodayNow(): Promise<boolean> {
  return syncDates([today()], { force: true });
}

/** Forget what was synced, e.g. after the export is switched off, so turning it on re-syncs. */
export function resetHealthSyncState() {
  synced.clear();
}

export function useHealthSync() {
  const enabled = useHealthStore((s) => s.enabled);
  const logs = useStore((s) => s.logs);
  // Bumped when the app returns to the foreground so a day rollover is noticed.
  const foreground = useForegroundTick();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!enabled) {
      resetHealthSyncState();
      return;
    }
    const timer = setTimeout(() => {
      const t = today();
      void syncDates([addDays(t, -1), t]);
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, logs, foreground]);
}

function useForegroundTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);
  return tick;
}
