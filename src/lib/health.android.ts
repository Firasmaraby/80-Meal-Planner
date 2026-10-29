/**
 * Android Health Connect implementation via react-native-health-connect (v4+, which bundles its own
 * Expo config plugin; the old `expo-health-connect` package is deprecated and must NOT be installed
 * alongside it).
 *
 * Write-only: the only permission requested is write Nutrition (`android.permission.health.WRITE_NUTRITION`,
 * declared in app.json). The app never reads health data.
 *
 * Idempotency: a sync deletes this app's Nutrition records inside the local day (Health Connect only
 * lets an app delete its own records), then inserts one NutritionRecord per meal slot with
 * `clientRecordId = eighty:<date>:<slot>` and an increasing `clientRecordVersion`. If the delete range
 * ever misses a record (for example after a timezone change), the insert with the same clientRecordId
 * still upserts it instead of duplicating.
 */
import {
  MealType,
  RecordingMethod,
  SdkAvailabilityStatus,
  deleteRecordsByTimeRange,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  requestPermission,
  type NutritionRecord,
} from 'react-native-health-connect';

import {
  SLOT_LABEL,
  buildDaySamples,
  dayBounds,
  healthConnectFields,
  type HealthItem,
  type HealthSlot,
  type SyncResult,
} from './healthMapping';

export type { HealthItem, SyncResult } from './healthMapping';

export const healthStoreName = 'Health Connect';

const MEAL_TYPE: Record<HealthSlot, number> = {
  breakfast: MealType.BREAKFAST,
  lunch: MealType.LUNCH,
  dinner: MealType.DINNER,
  snack: MealType.SNACK,
  extra: MealType.UNKNOWN,
};

const WRITE_NUTRITION = { accessType: 'write', recordType: 'Nutrition' } as const;

async function ensureClient(): Promise<boolean> {
  try {
    if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    return await initialize();
  } catch {
    return false;
  }
}

export async function isHealthAvailable(): Promise<boolean> {
  try {
    return (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

const hasWrite = (granted: { accessType: string; recordType: string }[]) =>
  granted.some((p) => p.accessType === 'write' && p.recordType === 'Nutrition');

export async function requestHealthPermission(): Promise<boolean> {
  try {
    if (!(await ensureClient())) return false;
    return hasWrite(await requestPermission([WRITE_NUTRITION]));
  } catch {
    return false;
  }
}

export async function syncDayToHealth(date: string, items: HealthItem[]): Promise<SyncResult> {
  if (!(await ensureClient())) throw new Error('Health Connect isn’t available on this device.');
  if (!hasWrite(await getGrantedPermissions())) throw new Error('Eighty doesn’t have permission to write to Health Connect.');

  const { start, end } = dayBounds(date);
  await deleteRecordsByTimeRange('Nutrition', {
    operator: 'between',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  });

  const version = Date.now();
  const records: NutritionRecord[] = buildDaySamples(date, items).map((sample) => ({
    recordType: 'Nutrition',
    startTime: sample.start.toISOString(),
    endTime: sample.end.toISOString(),
    name: SLOT_LABEL[sample.slot],
    mealType: MEAL_TYPE[sample.slot],
    metadata: {
      clientRecordId: sample.id,
      clientRecordVersion: version,
      recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
    },
    ...(healthConnectFields(sample) as Partial<NutritionRecord>),
  }));

  if (records.length > 0) await insertRecords(records);
  return { samples: records.length, skipped: 0 };
}
