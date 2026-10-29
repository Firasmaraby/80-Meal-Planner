/**
 * Local reminders: meal times, a night-before prep note and an evening check.
 * Everything is a no-op on web. Permission is only requested when the person asks for it
 * (saving reminder settings, starting a cook timer), never from the background sync.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { FOOD_INDEX } from '@/state/catalog';
import { useKitchen, useWeek, type ReminderSettings } from '@/state/kitchenStore';
import { today, useStore } from '@/state/store';

import { planReminders, reminderDays, type ReminderDay } from './kitchen';

type Notifications = typeof import('expo-notifications');

const PREFIX = 'eighty-rem-';
const TIMER_PREFIX = 'eighty-timer-';
const CHANNEL = 'reminders';
const isNative = Platform.OS !== 'web';

let setUp: Promise<Notifications> | null = null;
/** Load expo-notifications once: show notifications while the app is open, and make the Android channel. */
function notifications(): Promise<Notifications> {
  if (!setUp) {
    setUp = import('expo-notifications').then(async (N) => {
      N.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
      if (Platform.OS === 'android') {
        await N.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: N.AndroidImportance.DEFAULT });
      }
      return N;
    });
    setUp.catch(() => {
      setUp = null;
    });
  }
  return setUp;
}

/** True when we may notify. With `ask`, shows the system prompt if the person has not been asked yet. */
async function allowed(N: Notifications, ask: boolean): Promise<boolean> {
  const cur = await N.getPermissionsAsync();
  if (cur.granted) return true;
  if (!ask || !cur.canAskAgain) return false;
  const next = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return next.granted;
}

export type ScheduleStatus = 'unsupported' | 'off' | 'denied' | 'scheduled' | 'error';
export interface ScheduleResult {
  status: ScheduleStatus;
  count: number;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Cancel this app's reminders and schedule fresh ones from the upcoming days.
 * Calls run one at a time, so a sync and a save never interleave.
 * Cook timers are left alone.
 */
export function scheduleReminders(
  settings: ReminderSettings,
  upcomingDays: ReminderDay[],
  opts: { ask?: boolean; now?: Date } = {},
): Promise<ScheduleResult> {
  if (!isNative) return Promise.resolve({ status: 'unsupported', count: 0 });
  const run = async (): Promise<ScheduleResult> => {
    try {
      const N = await notifications();
      const pending = await N.getAllScheduledNotificationsAsync();
      await Promise.all(pending.filter((p) => p.identifier.startsWith(PREFIX)).map((p) => N.cancelScheduledNotificationAsync(p.identifier)));

      const planned = planReminders(settings, upcomingDays, opts.now ?? new Date());
      if (!planned.length) return { status: 'off', count: 0 };
      if (!(await allowed(N, !!opts.ask))) return { status: 'denied', count: 0 };

      for (const r of planned) {
        await N.scheduleNotificationAsync({
          identifier: r.id,
          content: { title: r.title, body: r.body },
          trigger: r.daily
            ? { type: N.SchedulableTriggerInputTypes.DAILY, hour: r.daily.hour, minute: r.daily.minute, channelId: CHANNEL }
            : { type: N.SchedulableTriggerInputTypes.DATE, date: r.at as Date, channelId: CHANNEL },
        });
      }
      return { status: 'scheduled', count: planned.length };
    } catch {
      return { status: 'error', count: 0 };
    }
  };
  const next = queue.then(run, run);
  queue = next;
  return next;
}

/** Ring in `seconds` (a cook timer). Resolves to an id for cancelTimerNotification, or null when not possible. */
export async function scheduleTimerNotification(seconds: number, body: string): Promise<string | null> {
  if (!isNative) return null;
  try {
    const N = await notifications();
    if (!(await allowed(N, true))) return null;
    return await N.scheduleNotificationAsync({
      identifier: `${TIMER_PREFIX}${Date.now().toString(36)}`,
      content: { title: 'Timer done', body },
      trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)), channelId: CHANNEL },
    });
  } catch {
    return null;
  }
}

export async function cancelTimerNotification(id: string | null | undefined): Promise<void> {
  if (!isNative || !id) return;
  try {
    const N = await notifications();
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    /* nothing to cancel */
  }
}

/** Notification permission, without asking. */
export async function reminderPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!isNative) return 'unsupported';
  try {
    const N = await notifications();
    return (await N.getPermissionsAsync()).granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

// ── Hooks ──────────────────────────────────────────────────────────────────

function useHydrated() {
  const [ready, setReady] = useState(() => useStore.persist.hasHydrated() && useKitchen.persist.hasHydrated());
  useEffect(() => {
    const check = () => setReady(useStore.persist.hasHydrated() && useKitchen.persist.hasHydrated());
    const a = useStore.persist.onFinishHydration(check);
    const b = useKitchen.persist.onFinishHydration(check);
    check();
    return () => {
      a();
      b();
    };
  }, []);
  return ready;
}

/** The upcoming days as reminders need them, kept fresh as the date rolls over. */
export function useReminderDays(): ReminderDay[] {
  const [from, setFrom] = useState(() => today());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setFrom(today());
    });
    return () => sub.remove();
  }, []);
  const week = useWeek(from);
  const household = useKitchen((s) => s.householdSize);
  return useMemo(() => reminderDays(week, FOOD_INDEX, household), [week, household]);
}

/**
 * Call once from the root layout. Reschedules (debounced) whenever reminder settings, the plan,
 * the meals on the coming days, or household size change. Never prompts for permission.
 */
export function useReminderSync() {
  const hydrated = useHydrated();
  const reminders = useKitchen((s) => s.reminders);
  const days = useReminderDays();
  const latest = useRef({ reminders, days });
  useEffect(() => {
    latest.current = { reminders, days };
  });
  const signature = JSON.stringify([reminders, days]);

  useEffect(() => {
    if (!isNative || !hydrated) return;
    const t = setTimeout(() => {
      void scheduleReminders(latest.current.reminders, latest.current.days);
    }, 1500);
    return () => clearTimeout(t);
  }, [signature, hydrated]);
}
