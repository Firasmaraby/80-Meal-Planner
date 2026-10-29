/**
 * Offline-first sync for food logs, per-day meal changes and the profile.
 *
 * Model
 *  - The device is the source of truth while offline. Every local edit bumps `updatedAt`
 *    (device clock); deleting sets `deletedAt` (tombstone) AND bumps `updatedAt`.
 *  - Push: `planSync` picks everything edited after `lastSyncAt`; `pushLogs` upserts it on
 *    (user_id, client_id), which makes retries idempotent. Conflicts are resolved by the
 *    database (`lww_guard` trigger): a write whose `client_updated_at` is older than the
 *    stored one is skipped, so last-write-wins by edit time, not by arrival time.
 *  - Pull: `pullLogs` fetches rows whose SERVER `updated_at` is past a cursor. The cursor is
 *    a server timestamp, so device clock skew cannot make us miss rows. `mergeRemoteLogs`
 *    applies them locally with the same last-write-wins rule.
 *
 * Column mapping: LogItem.id <-> food_logs.client_id, SyncableLog.updatedAt <->
 * client_updated_at (device clock, used for conflicts), food_logs.updated_at (server clock)
 * is only ever used as the pull cursor.
 *
 * Everything that does not touch the network is a pure function and is unit-tested in
 * sync.test.ts. This module only imports TYPES from supabase-js, so it loads in Node.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Ingredient, LogItem, MealSlot, Profile } from '../engine/types';
import type { AddedMeal } from '../state/store';

// ── Types ──────────────────────────────────────────────────────────────────

/** A LogItem as stored on the device: with edit time and an optional tombstone. */
export interface SyncableLog extends LogItem {
  /** ISO timestamp of the last local edit (device clock). Must also be bumped on delete. */
  updatedAt: string;
  /** ISO timestamp when the user deleted the item. The item is kept until the delete is synced. */
  deletedAt?: string;
  /** Plan version the meal was logged against (enrollments pin plan_id + version). */
  planVersion?: number;
}

/** Row shape of public.food_logs as sent by the client. */
export interface FoodLogRow {
  user_id: string;
  client_id: string;
  date: string;
  at: string;
  food_id: string;
  grams: number;
  plan_id: string | null;
  plan_version: number | null;
  meal_id: string | null;
  slot: MealSlot | null;
  client_updated_at: string;
  deleted_at: string | null;
}

/** Row shape of public.food_logs as returned by the server. */
export interface FoodLogServerRow extends FoodLogRow {
  id: string;
  updated_at: string;
}

export interface SyncPlan {
  /** Live items to upsert. */
  upserts: SyncableLog[];
  /** Tombstones to upsert (soft delete: the row is kept with deleted_at set). */
  deletes: SyncableLog[];
  /** Number of items that need no network call. */
  unchanged: number;
}

export interface LogSyncState {
  /** Device-clock time at which the last successful push STARTED (null = never synced). */
  lastPushAt: string | null;
  /** Server-clock `updated_at` of the newest row pulled so far (null = pull everything). */
  pullCursor: string | null;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Milliseconds since epoch, NaN for invalid input. Fractional seconds beyond milliseconds
 * (Postgres returns microseconds) are truncated first because not every JS engine parses them.
 */
export function parseTime(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
}

/** Most recent modification of an item: the later of updatedAt and deletedAt. */
function effectiveTime(log: SyncableLog): number {
  const u = parseTime(log.updatedAt);
  const d = parseTime(log.deletedAt);
  if (Number.isNaN(u)) return d;
  if (Number.isNaN(d)) return u;
  return Math.max(u, d);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!(size > 0)) throw new RangeError('chunk size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Decide what to push.
 *
 * An item needs pushing when it was modified after `lastSyncAt`, or when `lastSyncAt` is
 * null/invalid (never synced), or when its own timestamp is unreadable (be safe, push it).
 * Pushing is idempotent, so over-pushing is harmless; under-pushing loses data.
 *
 * The caller should capture `lastSyncAt` = the time the previous sync STARTED (before it
 * read local state), so edits made while that sync was in flight are picked up next time.
 */
export function planSync(local: readonly SyncableLog[], lastSyncAt: string | null | undefined): SyncPlan {
  const last = parseTime(lastSyncAt);
  const upserts: SyncableLog[] = [];
  const deletes: SyncableLog[] = [];
  let unchanged = 0;

  for (const item of local) {
    const t = effectiveTime(item);
    const dirty = Number.isNaN(last) || Number.isNaN(t) || t > last;
    if (!dirty) {
      unchanged++;
    } else if (item.deletedAt) {
      deletes.push(item);
    } else {
      upserts.push(item);
    }
  }

  const byTime = (a: SyncableLog, b: SyncableLog) =>
    (effectiveTime(a) || 0) - (effectiveTime(b) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  upserts.sort(byTime);
  deletes.sort(byTime);
  return { upserts, deletes, unchanged };
}

/**
 * Last-write-wins merge of pulled rows into the local list.
 *  - unknown id            -> added (tombstones too, so a later undelete can still win)
 *  - remote strictly newer -> replaces local
 *  - local strictly newer  -> kept (it will be pushed by the next planSync)
 *  - same timestamp        -> a tombstone beats a live item; otherwise local is kept
 * Returns a new array (local order preserved, new items appended) and the ids that changed.
 */
export function mergeRemoteLogs(
  local: readonly SyncableLog[],
  remote: readonly SyncableLog[],
): { merged: SyncableLog[]; changedIds: string[] } {
  const merged = local.slice();
  const index = new Map<string, number>();
  merged.forEach((l, i) => index.set(l.id, i));
  const changedIds: string[] = [];

  for (const r of remote) {
    const i = index.get(r.id);
    if (i === undefined) {
      index.set(r.id, merged.length);
      merged.push(r);
      changedIds.push(r.id);
      continue;
    }
    const l = merged[i];
    const lt = effectiveTime(l);
    const rt = effectiveTime(r);
    let remoteWins: boolean;
    if (Number.isNaN(rt)) remoteWins = false;
    else if (Number.isNaN(lt)) remoteWins = true;
    else if (rt !== lt) remoteWins = rt > lt;
    else remoteWins = !!r.deletedAt && !l.deletedAt;
    if (remoteWins) {
      merged[i] = r;
      changedIds.push(r.id);
    }
  }
  return { merged, changedIds };
}

/**
 * Drop tombstones whose delete has already been pushed (modified at or before `lastSyncAt`).
 * Keeps the local store from growing forever. Never drops an unsynced delete.
 */
export function pruneSyncedTombstones(local: readonly SyncableLog[], lastSyncAt: string | null | undefined): SyncableLog[] {
  const last = parseTime(lastSyncAt);
  if (Number.isNaN(last)) return local.slice();
  return local.filter((l) => {
    if (!l.deletedAt) return true;
    const t = effectiveTime(l);
    return Number.isNaN(t) || t > last;
  });
}

export function logToRow(userId: string, log: SyncableLog): FoodLogRow {
  const t = effectiveTime(log);
  return {
    user_id: userId,
    client_id: log.id,
    date: log.date,
    at: log.at,
    food_id: log.foodId,
    grams: log.grams,
    plan_id: log.planId ?? null,
    plan_version: log.planVersion ?? null,
    meal_id: log.mealId ?? null,
    slot: log.slot ?? null,
    // a delete always counts as an edit at least as recent as the delete itself
    client_updated_at: Number.isNaN(t) ? log.updatedAt : new Date(t).toISOString(),
    deleted_at: log.deletedAt ?? null,
  };
}

export function rowToLog(row: FoodLogRow): SyncableLog {
  const log: SyncableLog = {
    id: row.client_id,
    date: row.date,
    at: row.at,
    foodId: row.food_id,
    grams: Number(row.grams),
    updatedAt: row.client_updated_at,
  };
  if (row.plan_id != null) log.planId = row.plan_id;
  if (row.plan_version != null) log.planVersion = row.plan_version;
  if (row.meal_id != null) log.mealId = row.meal_id;
  if (row.slot != null) log.slot = row.slot;
  if (row.deleted_at != null) log.deletedAt = row.deleted_at;
  return log;
}

// ── Network: food logs ────────────────────────────────────────────────────

/** Pull this far behind the cursor to cover transactions that commit out of order. */
export const PULL_OVERLAP_MS = 10_000;

function fail(op: string, error: { message: string }): never {
  throw new Error(`sync ${op} failed: ${error.message}`, { cause: error });
}

/**
 * Upsert logs (live and tombstones) on (user_id, client_id). Idempotent. Rows that lose the
 * last-write-wins check on the server are skipped silently; the next pull reconciles them.
 */
export async function pushLogs(
  client: SupabaseClient,
  userId: string,
  logs: readonly SyncableLog[],
  batchSize = 200,
): Promise<{ pushed: number }> {
  // one statement must not contain the same conflict key twice: keep the newest per id
  const newest = new Map<string, SyncableLog>();
  for (const l of logs) {
    const prev = newest.get(l.id);
    if (!prev || effectiveTime(l) >= effectiveTime(prev)) newest.set(l.id, l);
  }
  const rows = [...newest.values()].map((l) => logToRow(userId, l));

  for (const batch of chunk(rows, batchSize)) {
    const { error } = await client.from('food_logs').upsert(batch, { onConflict: 'user_id,client_id' });
    if (error) fail('pushLogs', error);
  }
  return { pushed: rows.length };
}

/**
 * Fetch rows changed on the server since `cursor` (null = everything), tombstones included.
 * Returns them mapped to SyncableLog plus the new cursor (a server timestamp).
 */
export async function pullLogs(
  client: SupabaseClient,
  userId: string,
  cursor: string | null,
  pageSize = 1000,
): Promise<{ logs: SyncableLog[]; cursor: string | null }> {
  const cursorMs = parseTime(cursor);
  const since = Number.isNaN(cursorMs) ? null : new Date(cursorMs - PULL_OVERLAP_MS).toISOString();

  const logs: SyncableLog[] = [];
  let newCursor = cursor;
  for (let offset = 0; ; offset += pageSize) {
    let q = client
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (since) q = q.gte('updated_at', since);

    const { data, error } = await q;
    if (error) fail('pullLogs', error);
    const rows = (data ?? []) as FoodLogServerRow[];
    for (const row of rows) {
      logs.push(rowToLog(row));
      newCursor = row.updated_at; // ordered ascending, so the last row is the newest
    }
    if (rows.length < pageSize) break;
  }
  return { logs, cursor: newCursor };
}

/**
 * One full round: push local changes, then pull remote ones.
 * The caller merges `pulled` into its LIVE store with `mergeRemoteLogs` (the store may have
 * changed while the network calls were in flight) and persists `state`.
 */
export async function syncLogs(
  client: SupabaseClient,
  userId: string,
  local: readonly SyncableLog[],
  state: LogSyncState,
  now: () => Date = () => new Date(),
): Promise<{ pushed: number; pulled: SyncableLog[]; state: LogSyncState }> {
  const startedAt = now().toISOString();
  const plan = planSync(local, state.lastPushAt);
  const toPush = [...plan.upserts, ...plan.deletes];
  if (toPush.length) await pushLogs(client, userId, toPush);
  const { logs, cursor } = await pullLogs(client, userId, state.pullCursor);
  return { pushed: toPush.length, pulled: logs, state: { lastPushAt: startedAt, pullCursor: cursor } };
}

// ── Profile ───────────────────────────────────────────────────────────────

/** The Profile plus when it was last edited on this device. */
export interface SyncableProfile {
  profile: Profile;
  updatedAt: string;
}

/** Row shape of public.profiles. `is_admin` is deliberately absent: clients never send it. */
export interface ProfileRow {
  id: string;
  name: string | null;
  sex: Profile['sex'] | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity: Profile['activity'];
  goal: Profile['goal'];
  life_stage: Profile['lifeStage'];
  protein_per_kg: number;
  sat_fat_pct: number;
  size_to_me: boolean;
  dislikes: string[];
  diet: string[];
  client_updated_at: string;
}

export function profileToRow(userId: string, sp: SyncableProfile): ProfileRow {
  const p = sp.profile;
  return {
    id: userId,
    name: p.name?.trim() ? p.name.trim().slice(0, 100) : null,
    sex: p.sex,
    age: p.age,
    height_cm: p.heightCm,
    weight_kg: p.weightKg,
    activity: p.activity,
    goal: p.goal,
    life_stage: p.lifeStage,
    protein_per_kg: p.proteinPerKg,
    sat_fat_pct: p.satFatPct,
    size_to_me: p.sizeToMe,
    dislikes: p.dislikes,
    diet: p.diet,
    client_updated_at: sp.updatedAt,
  };
}

/**
 * Server row -> Profile. Returns null while onboarding is incomplete (the blank row created
 * at sign-up has no sex/age/height/weight), because a Profile requires them.
 */
export function rowToProfile(row: ProfileRow): SyncableProfile | null {
  if (row.sex == null || row.age == null || row.height_cm == null || row.weight_kg == null) return null;
  const profile: Profile = {
    sex: row.sex,
    age: row.age,
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    activity: row.activity,
    goal: row.goal,
    lifeStage: row.life_stage,
    proteinPerKg: Number(row.protein_per_kg),
    satFatPct: Number(row.sat_fat_pct),
    sizeToMe: row.size_to_me ?? true,
    dislikes: row.dislikes ?? [],
    diet: row.diet,
  };
  if (row.name != null) profile.name = row.name;
  return { profile, updatedAt: row.client_updated_at };
}

export type ProfileSyncAction = 'push' | 'pull' | 'none';

/** Last-write-wins between the local and the server profile. Equal timestamps: nothing to do. */
export function resolveProfile(local: SyncableProfile | null, remote: SyncableProfile | null): ProfileSyncAction {
  if (!local && !remote) return 'none';
  if (local && !remote) return 'push';
  if (!local && remote) return 'pull';
  const l = parseTime(local!.updatedAt);
  const r = parseTime(remote!.updatedAt);
  if (Number.isNaN(l) && Number.isNaN(r)) return 'none';
  if (Number.isNaN(r)) return 'push';
  if (Number.isNaN(l)) return 'pull';
  return l > r ? 'push' : r > l ? 'pull' : 'none';
}

export async function pushProfile(client: SupabaseClient, userId: string, sp: SyncableProfile): Promise<void> {
  const { error } = await client.from('profiles').upsert(profileToRow(userId, sp), { onConflict: 'id' });
  if (error) fail('pushProfile', error);
}

export async function pullProfile(client: SupabaseClient, userId: string): Promise<SyncableProfile | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) fail('pullProfile', error);
  return data ? rowToProfile(data as ProfileRow) : null;
}

/**
 * Reconcile the profile in both directions. Returns the profile the device should now hold
 * (the server's when it was newer, otherwise the local one).
 */
export async function syncProfile(
  client: SupabaseClient,
  userId: string,
  local: SyncableProfile | null,
): Promise<SyncableProfile | null> {
  const remote = await pullProfile(client, userId);
  const action = resolveProfile(local, remote);
  if (action === 'push' && local) {
    await pushProfile(client, userId, local);
    return local;
  }
  if (action === 'pull') return remote;
  return local ?? remote;
}

// ── Day meals (meals added to / removed from a day) ───────────────────────

/**
 * Row shape of public.day_meals as sent by the client.
 *  - kind 'added'   : a library meal put on `date`; `plan_meal_id` is the plan meal it replaces (or null).
 *  - kind 'skipped' : the plan meal `plan_meal_id` removed from `date`; slot/name/ingredients are empty.
 */
export interface DayMealRow {
  user_id: string;
  uid: string;
  date: string;
  kind: 'added' | 'skipped';
  library_key: string | null;
  plan_meal_id: string | null;
  slot: MealSlot | null;
  name: string | null;
  prep_minutes: number | null;
  instructions: string | null;
  ingredients: Ingredient[];
  client_updated_at: string;
  deleted_at: string | null;
}

/** Row shape of public.day_meals as returned by the server. */
export interface DayMealServerRow extends DayMealRow {
  id: string;
  updated_at: string;
}

export interface DayMealsState {
  dayAdds: Record<string, AddedMeal[]>;
  daySkips: Record<string, string[]>;
}

export interface DayMealSyncPlan {
  /** Live rows that are new or changed since the last synced state (resurrections included). */
  upserts: DayMealRow[];
  /** Rows that were live at the last sync but are gone locally: soft deletes. */
  tombstones: DayMealRow[];
  unchanged: number;
}

/** Deterministic client id of a skip, so the same skip from any device hits the same row. */
export function skipUid(date: string, planMealId: string): string {
  return `skip:${date}:${planMealId}`;
}

function cleanIngredient(i: Ingredient): Ingredient {
  const out: Ingredient = { foodId: i.foodId, grams: Number(i.grams) };
  if (i.swapGroup != null) out.swapGroup = i.swapGroup;
  if (i.note != null) out.note = i.note;
  return out;
}

/**
 * dayAdds / daySkips -> LIVE rows, all stamped `updatedAt`. Pure; it never emits tombstones
 * (it cannot know what was synced before): use `planDayMealSync` for that, and for not
 * re-stamping unchanged rows, which would beat newer edits made on another device.
 * Order: dates as given in the objects, adds before skips within a date. Duplicate skips collapse.
 */
export function dayMealsToRows(
  userId: string,
  dayAdds: Record<string, readonly AddedMeal[]>,
  daySkips: Record<string, readonly string[]>,
  updatedAt: string,
): DayMealRow[] {
  const rows: DayMealRow[] = [];
  const seen = new Set<string>();
  for (const [date, adds] of Object.entries(dayAdds)) {
    for (const m of adds) {
      if (seen.has(m.uid)) continue;
      seen.add(m.uid);
      rows.push({
        user_id: userId,
        uid: m.uid,
        date,
        kind: 'added',
        library_key: m.key,
        plan_meal_id: m.replaces ?? null,
        slot: m.slot,
        name: m.name,
        prep_minutes: m.prepMinutes ?? null,
        instructions: m.instructions ?? null,
        ingredients: m.ingredients.map(cleanIngredient),
        client_updated_at: updatedAt,
        deleted_at: null,
      });
    }
  }
  for (const [date, ids] of Object.entries(daySkips)) {
    for (const planMealId of ids) {
      const uid = skipUid(date, planMealId);
      if (seen.has(uid)) continue;
      seen.add(uid);
      rows.push({
        user_id: userId,
        uid,
        date,
        kind: 'skipped',
        library_key: null,
        plan_meal_id: planMealId,
        slot: null,
        name: null,
        prep_minutes: null,
        instructions: null,
        ingredients: [],
        client_updated_at: updatedAt,
        deleted_at: null,
      });
    }
  }
  return rows;
}

/**
 * Rows -> dayAdds / daySkips. Tombstones and malformed rows are ignored. Input order is kept
 * within each day. Pass the FULL set of rows (see `mergeDayMealRows`), not just an incremental pull.
 */
export function rowsToDayMeals(rows: readonly DayMealRow[]): DayMealsState {
  const dayAdds: Record<string, AddedMeal[]> = {};
  const daySkips: Record<string, string[]> = {};
  for (const r of rows) {
    if (r.deleted_at != null) continue;
    if (r.kind === 'skipped') {
      if (r.plan_meal_id == null) continue;
      const list = (daySkips[r.date] ??= []);
      if (!list.includes(r.plan_meal_id)) list.push(r.plan_meal_id);
    } else if (r.kind === 'added') {
      if (r.library_key == null || r.slot == null || r.name == null) continue;
      const meal: AddedMeal = {
        uid: r.uid,
        key: r.library_key,
        slot: r.slot,
        name: r.name,
        ingredients: (r.ingredients ?? []).map(cleanIngredient),
      };
      if (r.prep_minutes != null) meal.prepMinutes = Number(r.prep_minutes);
      if (r.instructions != null) meal.instructions = r.instructions;
      if (r.plan_meal_id != null) meal.replaces = r.plan_meal_id;
      (dayAdds[r.date] ??= []).push(meal);
    }
  }
  return { dayAdds, daySkips };
}

/** Everything about a row except its timestamps / tombstone: "did the user change this?" */
function dayMealContent(r: DayMealRow): string {
  return JSON.stringify([
    r.date, r.kind, r.library_key, r.plan_meal_id, r.slot, r.name, r.prep_minutes, r.instructions,
    r.ingredients.map((i) => [i.foodId, i.grams, i.swapGroup ?? null, i.note ?? null]),
  ]);
}

/**
 * Decide what to push. `synced` is the row set the device last pushed/pulled (including
 * tombstones); `current` is what the store holds now (from `dayMealsToRows`).
 *  - uid new, changed, or previously a tombstone -> upsert (stamped with the current row's time)
 *  - uid synced as live but absent now           -> tombstone (the old row, deleted at `updatedAt`)
 *  - otherwise                                    -> unchanged (not sent, so it cannot clobber newer remote edits)
 * Tombstones carry the full old row because the INSERT half of an upsert still has to satisfy
 * the table's CHECK constraints.
 */
export function planDayMealSync(
  current: readonly DayMealRow[],
  synced: readonly DayMealRow[],
  updatedAt: string,
): DayMealSyncPlan {
  const before = new Map(synced.map((r) => [r.uid, r]));
  const now = new Set<string>();
  const upserts: DayMealRow[] = [];
  const tombstones: DayMealRow[] = [];
  let unchanged = 0;

  for (const r of current) {
    now.add(r.uid);
    const prev = before.get(r.uid);
    if (!prev || prev.deleted_at != null || dayMealContent(prev) !== dayMealContent(r)) upserts.push(r);
    else unchanged++;
  }
  for (const prev of synced) {
    if (prev.deleted_at == null && !now.has(prev.uid)) {
      tombstones.push({ ...prev, client_updated_at: updatedAt, deleted_at: updatedAt });
    }
  }
  return { upserts, tombstones, unchanged };
}

/**
 * Last-write-wins merge of pulled rows into the known row set, by uid (same rule as
 * `mergeRemoteLogs`: strictly newer wins; on a tie a tombstone beats a live row, else local stays).
 */
export function mergeDayMealRows(local: readonly DayMealRow[], remote: readonly DayMealRow[]): DayMealRow[] {
  const merged = local.slice();
  const index = new Map(merged.map((r, i) => [r.uid, i]));
  for (const r of remote) {
    const i = index.get(r.uid);
    if (i === undefined) {
      index.set(r.uid, merged.length);
      merged.push(r);
      continue;
    }
    const l = merged[i];
    const lt = parseTime(l.client_updated_at);
    const rt = parseTime(r.client_updated_at);
    let remoteWins: boolean;
    if (Number.isNaN(rt)) remoteWins = false;
    else if (Number.isNaN(lt)) remoteWins = true;
    else if (rt !== lt) remoteWins = rt > lt;
    else remoteWins = r.deleted_at != null && l.deleted_at == null;
    if (remoteWins) merged[i] = r;
  }
  return merged;
}

function normalizeDayMealRow(row: DayMealRow): DayMealRow {
  return {
    user_id: row.user_id,
    uid: row.uid,
    date: row.date,
    kind: row.kind,
    library_key: row.library_key ?? null,
    plan_meal_id: row.plan_meal_id ?? null,
    slot: row.slot ?? null,
    name: row.name ?? null,
    prep_minutes: row.prep_minutes == null ? null : Number(row.prep_minutes),
    instructions: row.instructions ?? null,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients.map(cleanIngredient) : [],
    client_updated_at: row.client_updated_at,
    deleted_at: row.deleted_at ?? null,
  };
}

/** Upsert day-meal rows (live and tombstones) on (user_id, uid). Idempotent; stale writes lose server-side. */
export async function pushDayMeals(
  client: SupabaseClient,
  rows: readonly DayMealRow[],
  batchSize = 200,
): Promise<{ pushed: number }> {
  // one statement must not contain the same conflict key twice: keep the newest per uid
  const newest = new Map<string, DayMealRow>();
  for (const r of rows) {
    const prev = newest.get(r.uid);
    if (!prev || !(parseTime(r.client_updated_at) < parseTime(prev.client_updated_at))) newest.set(r.uid, r);
  }
  const batchRows = [...newest.values()];
  for (const batch of chunk(batchRows, batchSize)) {
    const { error } = await client.from('day_meals').upsert(batch, { onConflict: 'user_id,uid' });
    if (error) fail('pushDayMeals', error);
  }
  return { pushed: batchRows.length };
}

/**
 * Fetch day-meal rows changed on the server since `cursor` (null = everything), tombstones
 * included, plus the new cursor (a server timestamp). Merge with `mergeDayMealRows`, then
 * derive the store state with `rowsToDayMeals`.
 */
export async function pullDayMeals(
  client: SupabaseClient,
  userId: string,
  cursor: string | null,
  pageSize = 1000,
): Promise<{ rows: DayMealRow[]; cursor: string | null }> {
  const cursorMs = parseTime(cursor);
  const since = Number.isNaN(cursorMs) ? null : new Date(cursorMs - PULL_OVERLAP_MS).toISOString();

  const out: DayMealRow[] = [];
  let newCursor = cursor;
  for (let offset = 0; ; offset += pageSize) {
    let q = client
      .from('day_meals')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (since) q = q.gte('updated_at', since);

    const { data, error } = await q;
    if (error) fail('pullDayMeals', error);
    const rows = (data ?? []) as DayMealServerRow[];
    for (const row of rows) {
      out.push(normalizeDayMealRow(row));
      newCursor = row.updated_at;
    }
    if (rows.length < pageSize) break;
  }
  return { rows: out, cursor: newCursor };
}
