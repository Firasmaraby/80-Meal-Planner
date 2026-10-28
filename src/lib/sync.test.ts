import { describe, expect, it } from 'vitest';

import type { Profile } from '../engine/types';
import type { AddedMeal } from '../state/store';
import {
  chunk,
  dayMealsToRows,
  logToRow,
  mergeDayMealRows,
  mergeRemoteLogs,
  parseTime,
  planDayMealSync,
  planSync,
  profileToRow,
  pruneSyncedTombstones,
  resolveProfile,
  rowsToDayMeals,
  rowToLog,
  rowToProfile,
  skipUid,
  type DayMealRow,
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
    diet: ['vegetarian'],
  };

  it('round-trips through the row format', () => {
    const row = profileToRow('u1', { profile, updatedAt: T('09:00:00') });
    expect(rowToProfile(row)).toEqual({ profile, updatedAt: T('09:00:00') });
  });

  it('never includes is_admin in the payload', () => {
    expect(Object.keys(profileToRow('u1', { profile, updatedAt: T('09:00:00') }))).not.toContain('is_admin');
  });

  it('has no focus columns any more', () => {
    const keys = Object.keys(profileToRow('u1', { profile, updatedAt: T('09:00:00') }));
    expect(keys).not.toContain('focus');
    expect(keys).not.toContain('focus_started_at');
    expect(keys).not.toContain('locked_in');
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

describe('day meals', () => {
  const salad: AddedMeal = {
    uid: 'add-1',
    key: 'med~m7',
    slot: 'lunch',
    name: 'Chickpea salad',
    prepMinutes: 10,
    instructions: 'Toss.',
    ingredients: [
      { foodId: 'chickpeas', grams: 150, swapGroup: 'legumes', note: 'drained' },
      { foodId: 'olive_oil', grams: 10 },
    ],
  };
  const swap: AddedMeal = {
    uid: 'add-2',
    key: 'med~m9',
    slot: 'dinner',
    name: 'Grilled fish',
    ingredients: [{ foodId: 'salmon', grams: 180 }],
    replaces: 'm3',
  };
  const dayAdds = { '2026-10-28': [salad, swap], '2026-10-29': [{ ...salad, uid: 'add-3' }] };
  const daySkips = { '2026-10-28': ['m1', 'm2'], '2026-10-30': ['m5'] };
  const U = T('09:00:00');

  it('round-trips adds and skips through the row format', () => {
    const rows = dayMealsToRows('u1', dayAdds, daySkips, U);
    expect(rows).toHaveLength(6);
    expect(rowsToDayMeals(rows)).toEqual({ dayAdds, daySkips });
  });

  it('round-trips through JSON (what the network does)', () => {
    const rows = JSON.parse(JSON.stringify(dayMealsToRows('u1', dayAdds, daySkips, U))) as DayMealRow[];
    expect(rowsToDayMeals(rows)).toEqual({ dayAdds, daySkips });
  });

  it('maps an added meal to nulls for absent optionals and omits them going back', () => {
    const [row] = dayMealsToRows('u1', { '2026-10-28': [swap] }, {}, U);
    expect(row).toMatchObject({
      user_id: 'u1', uid: 'add-2', date: '2026-10-28', kind: 'added', library_key: 'med~m9',
      slot: 'dinner', name: 'Grilled fish', prep_minutes: null, instructions: null,
      client_updated_at: U, deleted_at: null,
    });
    const back = rowsToDayMeals([row]).dayAdds['2026-10-28'][0];
    expect('prepMinutes' in back).toBe(false);
    expect('instructions' in back).toBe(false);
  });

  it('a replacement carries the replaced plan meal in plan_meal_id', () => {
    const rows = dayMealsToRows('u1', dayAdds, {}, U);
    expect(rows.find((r) => r.uid === 'add-2')?.plan_meal_id).toBe('m3');
    expect(rows.find((r) => r.uid === 'add-1')?.plan_meal_id).toBeNull();
    expect(rowsToDayMeals(rows).dayAdds['2026-10-28'][1].replaces).toBe('m3');
  });

  it('skipped rows get a deterministic uid and carry the plan meal id', () => {
    const a = dayMealsToRows('u1', {}, daySkips, U);
    const b = dayMealsToRows('u1', {}, daySkips, T('12:00:00'));
    expect(a.map((r) => r.uid)).toEqual(['skip:2026-10-28:m1', 'skip:2026-10-28:m2', 'skip:2026-10-30:m5']);
    expect(b.map((r) => r.uid)).toEqual(a.map((r) => r.uid));
    expect(skipUid('2026-10-28', 'm1')).toBe('skip:2026-10-28:m1');
    expect(a[0]).toMatchObject({
      kind: 'skipped', plan_meal_id: 'm1', library_key: null, slot: null, name: null, ingredients: [],
    });
  });

  it('collapses duplicate skips and ignores tombstones and malformed rows when mapping back', () => {
    const rows = dayMealsToRows('u1', { '2026-10-28': [salad] }, { '2026-10-28': ['m1', 'm1'] }, U);
    expect(rows).toHaveLength(2);
    const dead = rows.map((r) => ({ ...r, deleted_at: U }));
    expect(rowsToDayMeals(dead)).toEqual({ dayAdds: {}, daySkips: {} });
    const broken: DayMealRow = { ...rows[0], name: null };
    expect(rowsToDayMeals([broken]).dayAdds).toEqual({});
  });

  it('never puts server-only columns in the payload', () => {
    const keys = Object.keys(dayMealsToRows('u1', dayAdds, daySkips, U)[0]);
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('updated_at');
  });

  describe('planDayMealSync', () => {
    it('pushes everything when nothing was synced', () => {
      const cur = dayMealsToRows('u1', dayAdds, daySkips, U);
      const plan = planDayMealSync(cur, [], U);
      expect(plan.upserts).toEqual(cur);
      expect(plan.tombstones).toEqual([]);
    });

    it('sends nothing for unchanged rows, even with a newer stamp', () => {
      const synced = dayMealsToRows('u1', dayAdds, daySkips, U);
      const cur = dayMealsToRows('u1', dayAdds, daySkips, T('11:00:00'));
      expect(planDayMealSync(cur, synced, T('11:00:00'))).toEqual({ upserts: [], tombstones: [], unchanged: 6 });
    });

    it('sends an edited added meal', () => {
      const synced = dayMealsToRows('u1', dayAdds, daySkips, U);
      const edited = { ...salad, ingredients: [{ foodId: 'chickpeas', grams: 200 }] };
      const cur = dayMealsToRows('u1', { ...dayAdds, '2026-10-28': [edited, swap] }, daySkips, T('11:00:00'));
      const plan = planDayMealSync(cur, synced, T('11:00:00'));
      expect(plan.upserts.map((r) => r.uid)).toEqual(['add-1']);
      expect(plan.upserts[0].client_updated_at).toBe(T('11:00:00'));
    });

    it('turns a removed add and a restored skip into full-row tombstones', () => {
      const synced = dayMealsToRows('u1', dayAdds, daySkips, U);
      const cur = dayMealsToRows('u1', { '2026-10-28': [swap], '2026-10-29': dayAdds['2026-10-29'] }, { '2026-10-28': ['m1'], '2026-10-30': ['m5'] }, T('11:00:00'));
      const plan = planDayMealSync(cur, synced, T('11:00:00'));
      expect(plan.tombstones.map((r) => r.uid).sort()).toEqual(['add-1', 'skip:2026-10-28:m2']);
      for (const t of plan.tombstones) {
        expect(t.deleted_at).toBe(T('11:00:00'));
        expect(t.client_updated_at).toBe(T('11:00:00'));
      }
      expect(plan.tombstones.find((r) => r.uid === 'add-1')?.name).toBe('Chickpea salad');
      expect(plan.upserts).toEqual([]);
    });

    it('resurrects a previously deleted skip (same uid, newer stamp)', () => {
      const tomb = dayMealsToRows('u1', {}, { '2026-10-28': ['m1'] }, U).map((r) => ({ ...r, deleted_at: U }));
      const cur = dayMealsToRows('u1', {}, { '2026-10-28': ['m1'] }, T('12:00:00'));
      const plan = planDayMealSync(cur, tomb, T('12:00:00'));
      expect(plan.upserts).toEqual(cur);
      expect(plan.tombstones).toEqual([]);
    });

    it('does not tombstone a row that is already a tombstone', () => {
      const tomb = dayMealsToRows('u1', {}, { '2026-10-28': ['m1'] }, U).map((r) => ({ ...r, deleted_at: U }));
      expect(planDayMealSync([], tomb, T('12:00:00'))).toEqual({ upserts: [], tombstones: [], unchanged: 0 });
    });
  });

  describe('mergeDayMealRows', () => {
    const [row] = dayMealsToRows('u1', {}, { '2026-10-28': ['m1'] }, T('10:00:00'));
    it('adds unknown uids, newer remote wins, newer local stays, tombstone wins a tie', () => {
      const newerDead = { ...row, client_updated_at: T('11:00:00'), deleted_at: T('11:00:00') };
      expect(mergeDayMealRows([], [row])).toEqual([row]);
      expect(mergeDayMealRows([row], [newerDead])).toEqual([newerDead]);
      expect(mergeDayMealRows([newerDead], [row])).toEqual([newerDead]);
      const tie = { ...row, deleted_at: T('10:00:00') };
      expect(mergeDayMealRows([row], [tie])).toEqual([tie]);
      expect(mergeDayMealRows([tie], [row])).toEqual([tie]);
    });
  });
});
