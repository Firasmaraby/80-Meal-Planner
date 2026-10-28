import { describe, expect, it } from 'vitest';

import type { Profile } from '../engine/types';
import {
  chunk,
  logToRow,
  mergeRemoteLogs,
  parseTime,
  planSync,
  profileToRow,
  pruneSyncedTombstones,
  resolveProfile,
  rowToLog,
  rowToProfile,
  type ProfileRow,
  type SyncableLog,
} from './sync';

const T = (s: string) => `2026-10-28T${s}.000Z`;

function log(id: string, updatedAt: string, extra: Partial<SyncableLog> = {}): SyncableLog {
  return { id, date: '2026-10-28', at: T('08:00:00'), foodId: 'kiwi', grams: 100, updatedAt, ...extra };
}

describe('planSync', () => {
  const lastSyncAt = T('10:00:00');

  it('pushes everything when never synced', () => {
    const plan = planSync([log('a', T('01:00:00')), log('b', T('02:00:00'), { deletedAt: T('02:00:00') })], null);
    expect(plan.upserts.map((l) => l.id)).toEqual(['a']);
    expect(plan.deletes.map((l) => l.id)).toEqual(['b']);
    expect(plan.unchanged).toBe(0);
  });

  it('pushes new local items created after the last sync', () => {
    const plan = planSync([log('new', T('11:00:00'))], lastSyncAt);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.deletes).toHaveLength(0);
  });

  it('pushes edited items (updatedAt moved past lastSyncAt)', () => {
    const edited = log('a', T('10:30:00'), { grams: 150 });
    const plan = planSync([edited], lastSyncAt);
    expect(plan.upserts).toEqual([edited]);
  });

  it('pushes deletions as tombstones, not as upserts', () => {
    const gone = log('a', T('10:30:00'), { deletedAt: T('10:30:00') });
    const plan = planSync([gone], lastSyncAt);
    expect(plan.upserts).toHaveLength(0);
    expect(plan.deletes).toEqual([gone]);
  });

  it('treats a tombstone with a stale updatedAt as modified by deletedAt', () => {
    const gone = log('a', T('09:00:00'), { deletedAt: T('10:30:00') });
    expect(planSync([gone], lastSyncAt).deletes).toHaveLength(1);
  });

  it('skips items already synced (updatedAt <= lastSyncAt), including the boundary', () => {
    const plan = planSync(
      [log('a', T('09:59:59')), log('b', lastSyncAt), log('c', T('05:00:00'), { deletedAt: T('06:00:00') })],
      lastSyncAt,
    );
    expect(plan.upserts).toHaveLength(0);
    expect(plan.deletes).toHaveLength(0);
    expect(plan.unchanged).toBe(3);
  });

  it('pushes items with an unreadable timestamp rather than losing them', () => {
    expect(planSync([log('a', 'not-a-date')], lastSyncAt).upserts).toHaveLength(1);
  });

  it('treats an invalid lastSyncAt as never synced', () => {
    expect(planSync([log('a', T('01:00:00'))], 'garbage').upserts).toHaveLength(1);
  });

  it('orders by modification time then id, and does not mutate the input', () => {
    const input = [log('b', T('11:00:00')), log('a', T('11:00:00')), log('c', T('10:30:00'))];
    const copy = [...input];
    expect(planSync(input, lastSyncAt).upserts.map((l) => l.id)).toEqual(['c', 'a', 'b']);
    expect(input).toEqual(copy);
  });

  it('is empty for empty input', () => {
    expect(planSync([], lastSyncAt)).toEqual({ upserts: [], deletes: [], unchanged: 0 });
  });
});

describe('mergeRemoteLogs (last-write-wins)', () => {
  it('adds items that only exist remotely', () => {
    const { merged, changedIds } = mergeRemoteLogs([log('a', T('01:00:00'))], [log('b', T('02:00:00'))]);
    expect(merged.map((l) => l.id)).toEqual(['a', 'b']);
    expect(changedIds).toEqual(['b']);
  });

  it('remote wins when strictly newer', () => {
    const remote = log('a', T('12:00:00'), { grams: 300 });
    const { merged, changedIds } = mergeRemoteLogs([log('a', T('11:00:00'), { grams: 100 })], [remote]);
    expect(merged).toEqual([remote]);
    expect(changedIds).toEqual(['a']);
  });

  it('local wins when strictly newer, so it still gets pushed', () => {
    const local = log('a', T('12:00:00'), { grams: 100 });
    const { merged, changedIds } = mergeRemoteLogs([local], [log('a', T('11:00:00'), { grams: 300 })]);
    expect(merged).toEqual([local]);
    expect(changedIds).toEqual([]);
  });

  it('a remote delete newer than a local edit removes the item (tombstone wins)', () => {
    const tomb = log('a', T('12:00:00'), { deletedAt: T('12:00:00') });
    const { merged } = mergeRemoteLogs([log('a', T('11:00:00'))], [tomb]);
    expect(merged[0].deletedAt).toBe(T('12:00:00'));
  });

  it('a local edit newer than a remote delete resurrects the item', () => {
    const local = log('a', T('13:00:00'));
    const { merged } = mergeRemoteLogs([local], [log('a', T('12:00:00'), { deletedAt: T('12:00:00') })]);
    expect(merged[0].deletedAt).toBeUndefined();
    expect(merged[0]).toBe(local);
  });

  it('on equal timestamps a tombstone beats a live item, and live never beats a tombstone', () => {
    const live = log('a', T('12:00:00'));
    const dead = log('a', T('12:00:00'), { deletedAt: T('12:00:00') });
    expect(mergeRemoteLogs([live], [dead]).merged[0]).toBe(dead);
    expect(mergeRemoteLogs([dead], [live]).merged[0]).toBe(dead);
  });

  it('on equal timestamps and equal liveness the local copy is kept (no churn)', () => {
    const a = log('a', T('12:00:00'), { grams: 1 });
    const b = log('a', T('12:00:00'), { grams: 2 });
    const { merged, changedIds } = mergeRemoteLogs([a], [b]);
    expect(merged[0]).toBe(a);
    expect(changedIds).toEqual([]);
  });

  it('is idempotent and does not mutate its inputs', () => {
    const local = [log('a', T('11:00:00'))];
    const remote = [log('a', T('12:00:00')), log('b', T('12:00:00'))];
    const once = mergeRemoteLogs(local, remote).merged;
    const twice = mergeRemoteLogs(once, remote);
    expect(twice.merged).toEqual(once);
    expect(twice.changedIds).toEqual([]);
    expect(local).toHaveLength(1);
  });

  it('ignores a remote item with an unreadable timestamp when local is valid', () => {
    const local = log('a', T('11:00:00'));
    expect(mergeRemoteLogs([local], [log('a', 'bogus')]).merged[0]).toBe(local);
  });
});

describe('pruneSyncedTombstones', () => {
  it('drops pushed tombstones but keeps unsynced deletes and live items', () => {
    const last = T('10:00:00');
    const out = pruneSyncedTombstones(
      [
        log('live', T('09:00:00')),
        log('pushed', T('09:00:00'), { deletedAt: T('09:30:00') }),
        log('pending', T('09:00:00'), { deletedAt: T('10:30:00') }),
      ],
      last,
    );
    expect(out.map((l) => l.id)).toEqual(['live', 'pending']);
  });

  it('keeps everything when never synced', () => {
    expect(pruneSyncedTombstones([log('x', T('01:00:00'), { deletedAt: T('01:00:00') })], null)).toHaveLength(1);
  });
});

describe('row mapping', () => {
  it('maps a plan-meal log to a row and back without loss', () => {
    const l = log('c1', T('09:00:00'), { planId: 'med', planVersion: 3, mealId: 'm1', slot: 'lunch' });
    const row = logToRow('user-1', l);
    expect(row).toMatchObject({
      user_id: 'user-1',
      client_id: 'c1',
      food_id: 'kiwi',
      plan_id: 'med',
      plan_version: 3,
      meal_id: 'm1',
      slot: 'lunch',
      client_updated_at: T('09:00:00'),
      deleted_at: null,
    });
    expect(rowToLog(row)).toEqual(l);
  });

  it('uses null for free foods and omits the keys when mapping back', () => {
    const row = logToRow('u', log('c2', T('09:00:00')));
    expect(row.plan_id).toBeNull();
    expect(row.slot).toBeNull();
    const back = rowToLog(row);
    expect('planId' in back).toBe(false);
    expect('deletedAt' in back).toBe(false);
  });

  it('never sends a client_updated_at older than the delete itself', () => {
    const row = logToRow('u', log('c3', T('09:00:00'), { deletedAt: T('09:30:00') }));
    expect(row.client_updated_at).toBe(T('09:30:00'));
    expect(row.deleted_at).toBe(T('09:30:00'));
  });

  it('does not put server-only columns in the payload', () => {
    const keys = Object.keys(logToRow('u', log('c4', T('09:00:00'))));
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('updated_at');
  });
});

describe('profile sync', () => {
  const profile: Profile = {
    name: 'Ada',
    sex: 'female',
    age: 34,
    heightCm: 168,
    weightKg: 61.5,
    activity: 'moderate',
    goal: 'maintain',
    lifeStage: 'none',
    proteinPerKg: 1.6,
    satFatPct: 10,
    focus: ['iron', 'magnesium', 'vitD'],
    focusStartedAt: '2026-10-01',
    lockedIn: ['vitC'],
    diet: ['vegetarian'],
  };

  it('round-trips through the row format', () => {
    const row = profileToRow('u1', { profile, updatedAt: T('09:00:00') });
    expect(rowToProfile(row)).toEqual({ profile, updatedAt: T('09:00:00') });
  });

  it('never includes is_admin in the payload', () => {
    expect(Object.keys(profileToRow('u1', { profile, updatedAt: T('09:00:00') }))).not.toContain('is_admin');
  });

  it('trims a timestamp to a DATE for focus_started_at and caps focus at 3', () => {
    const row = profileToRow('u1', {
      profile: { ...profile, focusStartedAt: '2026-10-01T12:34:56.000Z', focus: ['iron', 'zinc', 'b12', 'vitK'] },
      updatedAt: T('09:00:00'),
    });
    expect(row.focus_started_at).toBe('2026-10-01');
    expect(row.focus).toHaveLength(3);
  });

  it('treats the blank sign-up row as "no profile yet"', () => {
    const blank: ProfileRow = {
      ...profileToRow('u1', { profile, updatedAt: T('09:00:00') }),
      sex: null,
      age: null,
      height_cm: null,
      weight_kg: null,
      client_updated_at: '1970-01-01T00:00:00+00:00',
    };
    expect(rowToProfile(blank)).toBeNull();
  });

  it('resolveProfile: last write wins, missing side loses', () => {
    const older = { profile, updatedAt: T('09:00:00') };
    const newer = { profile, updatedAt: T('10:00:00') };
    expect(resolveProfile(null, null)).toBe('none');
    expect(resolveProfile(older, null)).toBe('push');
    expect(resolveProfile(null, older)).toBe('pull');
    expect(resolveProfile(newer, older)).toBe('push');
    expect(resolveProfile(older, newer)).toBe('pull');
    expect(resolveProfile(older, older)).toBe('none');
  });
});

describe('helpers', () => {
  it('parseTime tolerates Postgres microsecond timestamps', () => {
    expect(parseTime('2026-10-28T14:05:06.921600+00:00')).toBe(Date.parse('2026-10-28T14:05:06.921Z'));
    expect(parseTime(undefined)).toBeNaN();
    expect(parseTime('nope')).toBeNaN();
  });

  it('chunk splits and rejects bad sizes', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });
});
