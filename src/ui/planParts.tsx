/**
 * Shared pieces for the plan screens (onboarding, plan library, plan detail):
 * the micronutrient fingerprint, plan averages, diet matching, a pill and a bottom action bar.
 */
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { boardProgress, dayPlanTotal, sum, type NutrientProgress } from '@/engine/calc';
import { BOARD_KEYS, NUTRIENTS } from '@/engine/nutrients';
import type { MealPlan, NutrientKey, NutrientVector, Profile } from '@/engine/types';
import { FOOD_INDEX } from '@/state/catalog';

import { Icon, Row, Txt, type IconName } from './primitives';
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

export function dietMatches(plan: MealPlan, diet: string[]): boolean {
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

/** Wide enough for the bottom bar, so scrolling content clears it. */
export const BAR_CLEARANCE = 150;
