/** Pieces of a library recipe shared by the library, meal, plan and cook screens. */
import { View } from 'react-native';

import { recipeMinutes } from '@/engine/families';
import { NUTRIENTS } from '@/engine/nutrients';
import type { Meal, MealSlot } from '@/engine/types';

import { Icon, I, Row, Txt } from './primitives';
import { radius, space, useTheme } from './theme';

/** "Suhoor" for a plan that renames the slot, otherwise the usual word. */
export const slotLabelOf = (slot: MealSlot, names: Partial<Record<MealSlot, string>> | undefined, fallback: Record<MealSlot, string>) =>
  names?.[slot] ?? fallback[slot];

/** "40 min" from prep plus cook. */
export function minutesLabel(meal: Pick<Meal, 'prepMinutes' | 'cookMinutes'>): string | undefined {
  const m = recipeMinutes(meal);
  return m ? `${m} min` : undefined;
}

/** A small rounded tag. */
export function TagChip({ label }: { label: string }) {
  const c = useTheme();
  return (
    <View style={{ paddingHorizontal: 9, height: 24, borderRadius: radius.pill, backgroundColor: c.surface2, justifyContent: 'center' }}>
      <Txt v="caption" dim={1} style={{ fontSize: 12, fontWeight: '700' }}>
        {label}
      </Txt>
    </View>
  );
}

/** The recipe's pitch: what it is and why it is good for you, then where it came from, small. */
export function RecipeAbout({ about, inspiredBy }: { about?: string; inspiredBy?: string }) {
  if (!about && !inspiredBy) return null;
  return (
    <View style={{ marginTop: space.sm, gap: 4 }}>
      {about ? (
        <Txt v="body" dim={1} style={{ fontSize: 16, lineHeight: 24 }}>
          {about}
        </Txt>
      ) : null}
      {inspiredBy ? (
        <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
          {/^inspired/i.test(inspiredBy) ? inspiredBy : `Inspired by ${inspiredBy}`}
        </Txt>
      ) : null}
    </View>
  );
}

/** The method as a numbered list, in type that is easy to read at the stove. */
export function RecipeSteps({ steps }: { steps: string[] }) {
  const c = useTheme();
  return (
    <View style={{ gap: space.md }} accessibilityRole="list">
      {steps.map((s, i) => (
        <View key={i} accessible accessibilityLabel={`Step ${i + 1}. ${s}`} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            <Txt v="caption" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {i + 1}
            </Txt>
          </View>
          <Txt v="body" style={{ flex: 1, fontSize: 16, lineHeight: 24 }}>
            {s}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** One "make it your own" line. */
export function RecipeTip({ tip }: { tip?: string }) {
  const c = useTheme();
  if (!tip) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Tip. ${tip}`}
      style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.accentSoft, alignItems: 'flex-start' }}>
      <Icon name={I.bulb} size={16} color={c.accent} />
      <Txt v="body" style={{ flex: 1, lineHeight: 22 }}>
        {tip}
      </Txt>
    </View>
  );
}

const pctText = (pct: number) => `${Math.round(pct * 100).toLocaleString()}%`;

/** "Big on Vitamin K 427% and Biotin 158%": what the meal is best at, from the plan build. */
export function HeroLine({ heroes }: { heroes?: Meal['heroes'] }) {
  const c = useTheme();
  if (!heroes?.length) return null;
  const parts = heroes.map((h) => `${NUTRIENTS[h.key].label} ${pctText(h.pct)}`);
  return (
    <Row gap={6} style={{ alignItems: 'flex-start' }}>
      <View style={{ marginTop: 2 }}>
        <Icon name={I.spark} size={12} color={c.accent} />
      </View>
      <Txt v="caption" color={c.accent} style={{ flex: 1, fontWeight: '700', lineHeight: 17 }} accessibilityLabel={`Best at ${parts.join(' and ')} of a day's need`}>
        Big on {parts.join(' and ')}
      </Txt>
    </Row>
  );
}
