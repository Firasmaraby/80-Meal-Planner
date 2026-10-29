/**
 * Health app export, web / default implementation: a no-op.
 *
 * Metro picks `health.ios.ts` on iOS and `health.android.ts` on Android; everything else (web, and
 * vitest) lands here, so the web bundle never imports a native health module.
 *
 * All three files export the same API:
 *  - healthStoreName        user-facing name of the platform health app
 *  - isHealthAvailable()    can this device store nutrition at all?
 *  - requestHealthPermission()  show the system permission sheet; true when writing is allowed
 *  - syncDayToHealth(date, items)  replace what Eighty wrote for `date` with `items`
 */
import type { HealthItem, SyncResult } from './healthMapping';

export type { HealthItem, SyncResult } from './healthMapping';

export const healthStoreName = 'Health';

export async function isHealthAvailable(): Promise<boolean> {
  return false;
}

export async function requestHealthPermission(): Promise<boolean> {
  return false;
}

export async function syncDayToHealth(_date: string, _items: HealthItem[]): Promise<SyncResult> {
  return { samples: 0, skipped: 0 };
}
