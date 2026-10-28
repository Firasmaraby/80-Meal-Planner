/**
 * Shared pieces for the plan screens (onboarding, plan library, plan detail):
 * the micronutrient fingerprint, plan averages, diet matching, a pill and a bottom action bar.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { boardProgress, dayPlanTotal, sum, type NutrientProgress } from '@/engine/calc';
import { BOARD_KEYS, NUTRIENTS } from '@/engine/nutrients';
import type { Meal, MealPlan, MealSlot, NutrientKey, NutrientVector, Profile } from '@/engine/types';
import { FOOD_INDEX } from '@/state/catalog';

import { MealArt } from './MealArt';
import { Icon, Row, Txt, tap, type IconName } from './primitives';
import { groupColor, MAX_WIDTH, radius, space, useTheme } from './theme';

// ── Diet filters ───────────────────────────────────────────────────────────

export const DIET_OPTIONS = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'pescatarian', label: 'Pescatarian' },
  { key: 'dairy-free', label: 'Dairy-free' },
  { key: 'gluten-free', label: 'Gluten-free' },
] as const;

/** A plan tagged "vegan" also satisfies "vegetarian" and "dairy-free", and so on. */
const SATISFIED_BY: Record<string, string[]> = {
  vegetarian: ['vegetarian', 'vegan'],
  vegan: ['vegan'],
  pescatarian: ['pescatarian', 'vegetarian', 'vegan'],
  'dairy-free': ['dairy-free', 'vegan'],
  'gluten-free': ['gluten-free'],
};

export function dietMatches(plan: Pick<MealPlan, 'tags'>, diet: string[]): boolean {
  const tags = plan.tags.map((t) => t.toLowerCase());
  return diet.every((d) => (SATISFIED_BY[d] ?? [d]).some((t) => tags.includes(t)));
}

export const tagLabel = (t: string) => {
  const known = DIET_OPTIONS.find((d) => d.key === t);
  if (known) return known.label;
  const s = t.replace(/[-_]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const bandKey = (b: { min: number; max: number }) => `${b.min}-${b.max}`;

// ── Plan math ──────────────────────────────────────────────────────────────

/** The plan's average day: nutrient totals summed over all days, divided by day count. */
export function planAverage(plan: MealPlan): NutrientVector {
  const n = plan.days.length || 1;
  const total = sum(plan.days.map((d) => dayPlanTotal(d, FOOD_INDEX)));
  const out: NutrientVector = {};
  for (const k in total) out[k as NutrientKey] = (total[k as NutrientKey] ?? 0) / n;
  return out;
}

export type Who = Pick<Profile, 'sex' | 'age' | 'lifeStage'>;

export interface PlanStats {
  avg: NutrientVector;
  progress: NutrientProgress[];
  /** board nutrients at ≥ 80% on the average day */
  covered: number;
  /** board nutrients we have data for (biotin has none yet, so it is not counted as a miss) */
  of: number;
}

export function planStats(plan: MealPlan, who: Who): PlanStats {
  const avg = planAverage(plan);
  const progress = boardProgress(avg, who);
  const scored = progress.filter((p) => p.amount != null);
  return { avg, progress, covered: scored.filter((p) => p.complete).length, of: scored.length };
}

export function useWho(profile: Profile): Who {
  const { sex, age, lifeStage } = profile;
  return useMemo(() => ({ sex, age, lifeStage }), [sex, age, lifeStage]);
}

// ── Fingerprint ────────────────────────────────────────────────────────────

/**
 * The plan's micronutrient fingerprint: one square per board nutrient (5 × 5),
 * coloured by group. Solid = the plan reaches 80% of your RDA, pale = it falls short,
 * outline = no food data yet.
 */
export function Fingerprint({
  progress,
  size = 13,
  gap = 3,
  cols = 5,
}: {
  progress: NutrientProgress[];
  size?: number;
  gap?: number;
  cols?: number;
}) {
  const c = useTheme();
  const byKey = new Map(progress.map((p) => [p.key, p]));
  const scored = progress.filter((p) => p.amount != null);
  const done = scored.filter((p) => p.complete).length;
  return (
    <View
      accessible
      accessibilityLabel={`Micronutrient fingerprint: ${done} of ${scored.length} nutrients reach 80%`}
      style={{ width: cols * size + (cols - 1) * gap, flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {BOARD_KEYS.map((k) => {
        const p = byKey.get(k);
        const g = groupColor(c, k === 'fiber' ? 'fiber' : NUTRIENTS[k].group);
        const on = !!p?.complete;
        const noData = !p || p.amount == null;
        return (
          <View
            key={k}
            style={{
              width: size,
              height: size,
              borderRadius: Math.max(3, Math.round(size / 4)),
              backgroundColor: noData ? 'transparent' : on ? g.fg : g.soft,
              borderWidth: 1,
              borderColor: on ? g.fg : c.line,
            }}
          />
        );
      })}
    </View>
  );
}

/** "filled = ≥ 80%" key, so the visual explains itself. */
export function FingerprintLegend() {
  const c = useTheme();
  return (
    <Row gap={space.lg}>
      <Row gap={6}>
        <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: c.ink2 }} />
        <Txt v="caption" dim={1}>
          Reaches 80%
        </Txt>
      </Row>
      <Row gap={6}>
        <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line }} />
        <Txt v="caption" dim={1}>
          Falls short
        </Txt>
      </Row>
    </Row>
  );
}

// ── Small bits ─────────────────────────────────────────────────────────────

export function Pill({ label, icon, color, bg }: { label: string; icon?: IconName; color?: string; bg?: string }) {
  const c = useTheme();
  const fg = color ?? c.ink2;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        height: 24,
        borderRadius: radius.pill,
        backgroundColor: bg ?? c.surface2,
      }}>
      {icon && <Icon name={icon} size={11} color={fg} />}
      <Txt v="caption" color={fg} style={{ fontSize: 12, fontWeight: '700' }}>
        {label}
      </Txt>
    </View>
  );
}

/** Pinned to the bottom of a screen, centred to the content width. */
export function BottomBar({ children }: { children: ReactNode }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: c.bg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.line,
        paddingBottom: Math.max(insets.bottom, space.md),
      }}>
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm }}>
        {children}
      </View>
    </View>
  );
}

// ── Meals ──────────────────────────────────────────────────────────────────

export const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
export const SLOT_PLURAL: Record<MealSlot, string> = { breakfast: 'Breakfasts', lunch: 'Lunches', dinner: 'Dinners', snack: 'Snacks' };
export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** The meal's picture: its photo when it has one, otherwise the plate drawn from its ingredients. */
export function MealThumb({ meal, size = 56 }: { meal: Pick<Meal, 'ingredients' | 'photoUrl'>; size?: number }) {
  const c = useTheme();
  if (!meal.photoUrl) return <MealArt ingredients={meal.ingredients} size={size} />;
  return (
    <Image
      source={{ uri: meal.photoUrl }}
      contentFit="cover"
      transition={150}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, borderRadius: size > 100 ? radius.lg : radius.md, backgroundColor: c.surface2 }}
    />
  );
}

/** Horizontal chip row that bleeds to the screen edge. */
export function ChipRow({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: space.md }}>
      {label ? (
        <Txt v="label" dim={2} style={{ marginBottom: 6 }}>
          {label}
        </Txt>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.lg }}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {children}
      </ScrollView>
    </View>
  );
}

/** Open a meal in the library. The key is `${planId}~${mealId}`; the screen decodes it. */
export const openLibraryMeal = (key: string) =>
  router.push({ pathname: '/library/[key]', params: { key: encodeURIComponent(key) } });

/** The board nutrients a set of totals covers best, as % of the person's daily need. */
export function topMicros(totals: NutrientVector, who: Who, n = 3): NutrientProgress[] {
  return boardProgress(totals, who)
    .filter((x) => x.amount != null && x.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, n);
}

/** "512 kcal · P 32 · C 40 · F 18", with the macro letters in their colours. */
export function MacroLine({ totals }: { totals: NutrientVector }) {
  const c = useTheme();
  const r = (k: NutrientKey) => Math.round(totals[k] ?? 0);
  const part = (letter: string, k: NutrientKey, color: string) => (
    <Txt v="caption" dim={1} key={letter}>
      <Txt v="caption" color={color} style={{ fontWeight: '800' }}>
        {letter}
      </Txt>{' '}
      {r(k)}
    </Txt>
  );
  return (
    <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
      <Txt v="caption" dim={1}>
        <Txt v="caption" style={{ fontWeight: '800' }}>
          {r('kcal').toLocaleString()}
        </Txt>{' '}
        kcal
      </Txt>
      {part('P', 'protein', c.protein)}
      {part('C', 'carbs', c.carbs)}
      {part('F', 'fat', c.fat)}
    </Row>
  );
}

/** kcal, protein, carbs, fat and fiber as one row of big numbers. */
export function MacroRow({ totals }: { totals: NutrientVector }) {
  const c = useTheme();
  const items: { label: string; value: string; color: string }[] = [
    { label: 'kcal', value: Math.round(totals.kcal ?? 0).toLocaleString(), color: c.ink },
    { label: 'protein', value: `${Math.round(totals.protein ?? 0)}g`, color: c.protein },
    { label: 'carbs', value: `${Math.round(totals.carbs ?? 0)}g`, color: c.carbs },
    { label: 'fat', value: `${Math.round(totals.fat ?? 0)}g`, color: c.fat },
    { label: 'fiber', value: `${Math.round(totals.fiber ?? 0)}g`, color: c.fiber },
  ];
  return (
    <View
      accessible
      accessibilityLabel={items.map((i) => `${i.value.replace('g', ' grams')} ${i.label}`).join(', ')}
      style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {items.map((i) => (
        <View key={i.label} style={{ flex: 1 }}>
          <Txt v="num" color={i.color} style={{ fontSize: 17 }}>
            {i.value}
          </Txt>
          <Txt v="caption" dim={2} style={{ fontSize: 11 }}>
            {i.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** Two or three options in one rounded track; the chosen one sits raised. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  const c = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: c.surface2 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) tap('select');
              onChange(o.key);
            }}
            style={{
              flex: 1,
              height: 36,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? c.surface : 'transparent',
              borderWidth: on ? StyleSheet.hairlineWidth : 0,
              borderColor: c.line,
            }}>
            <Txt v="caption" color={on ? c.ink : c.ink2} style={{ fontWeight: '700' }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wide enough for the bottom bar, so scrolling content clears it. */
export const BAR_CLEARANCE = 150;
