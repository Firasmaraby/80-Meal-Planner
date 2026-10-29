/**
 * Apple Health (HealthKit) implementation via @kingstinct/react-native-healthkit.
 *
 * Write-only: we request `toShare` for dietary types and nothing to read. The app never reads
 * health data.
 *
 * Idempotency: every sample carries the custom metadata key `EightyDate` (the local YYYY-MM-DD it
 * belongs to) and `EightySampleId` (`eighty:<date>:<slot>`). A sync first deletes this app's samples
 * with `EightyDate == date` (HealthKit only ever lets an app delete its own samples), then writes
 * one quantity sample per nutrient per meal slot (see healthMapping.ts for why per slot).
 */
import {
  AuthorizationStatus,
  authorizationStatusFor,
  deleteObjects,
  isHealthDataAvailableAsync,
  requestAuthorization,
  saveQuantitySample,
  type QuantityTypeIdentifierWriteable,
} from '@kingstinct/react-native-healthkit';

import {
  HEALTHKIT_WRITE_TYPES,
  SLOT_LABEL,
  buildDaySamples,
  errorMessage,
  healthKitQuantities,
  type HealthItem,
  type SyncResult,
} from './healthMapping';

export type { HealthItem, SyncResult } from './healthMapping';

export const healthStoreName = 'Apple Health';

const META_DATE = 'EightyDate';
const META_ID = 'EightySampleId';
/** Energy is always written, so its status stands in for "the user allowed Eighty to write". */
const PROBE_TYPE: QuantityTypeIdentifierWriteable = 'HKQuantityTypeIdentifierDietaryEnergyConsumed';

export async function isHealthAvailable(): Promise<boolean> {
  try {
    return await isHealthDataAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Shows the HealthKit sheet (iOS shows it once per type set; later calls resolve silently). The
 * boolean from requestAuthorization only says the request was processed, so we read the real write
 * status back for the energy type. Individual nutrients can still be switched off by the user in
 * the sheet; those are skipped at sync time.
 */
export async function requestHealthPermission(): Promise<boolean> {
  try {
    await requestAuthorization({ toShare: HEALTHKIT_WRITE_TYPES, toRead: [] });
    return authorizationStatusFor(PROBE_TYPE) === AuthorizationStatus.sharingAuthorized;
  } catch {
    return false;
  }
}

export async function syncDayToHealth(date: string, items: HealthItem[]): Promise<SyncResult> {
  const samples = buildDaySamples(date, items);
  let firstError: unknown;
  const note = (e: unknown) => {
    firstError ??= e;
  };

  // 1. Remove everything Eighty wrote for this date. A type whose delete fails (typically: the user
  //    denied it) is not rewritten either, so a failed delete can never leave duplicates behind.
  const undeletable = new Set<QuantityTypeIdentifierWriteable>();
  await Promise.all(
    HEALTHKIT_WRITE_TYPES.map(async (id) => {
      try {
        await deleteObjects(id, { metadata: { withMetadataKey: META_DATE, value: date } });
      } catch (e) {
        undeletable.add(id);
        note(e);
      }
    }),
  );

  // 2. Write the current state.
  let written = 0;
  let skipped = 0;
  for (const sample of samples) {
    const metadata = {
      [META_DATE]: date,
      [META_ID]: sample.id,
      HKFoodType: SLOT_LABEL[sample.slot],
      HKWasUserEntered: true,
    };
    const results = await Promise.all(
      healthKitQuantities(sample).map(async (q) => {
        if (undeletable.has(q.id)) return false;
        try {
          const saved = await saveQuantitySample(q.id, q.unit, q.value, sample.start, sample.end, metadata);
          return saved != null;
        } catch (e) {
          note(e);
          return false;
        }
      }),
    );
    if (results.some(Boolean)) written += 1;
    skipped += results.filter((ok) => !ok).length;
  }

  // Everything we tried failed: surface it so the UI can show lastError and keep retrying.
  const attempted = samples.length > 0 ? written : HEALTHKIT_WRITE_TYPES.length - undeletable.size;
  if (firstError !== undefined && attempted === 0) throw new Error(errorMessage(firstError));
  return { samples: written, skipped };
}
