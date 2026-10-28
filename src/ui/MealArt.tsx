import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { Food, Ingredient } from '@/engine/types';
import { FOOD_INDEX } from '@/state/catalog';

import { useTheme, type Palette } from './theme';

/**
 * A meal drawn as a plate: the rim is split by what's on it (by weight),
 * so a glance shows a plate that's half vegetables, a quarter protein, and so on.
 * Stands in for photos until plans ship with them.
 */
type Group = 'veg' | 'fruit' | 'protein' | 'legume' | 'grain' | 'fat' | 'other';

const groupOf = (f?: Food): Group => {
  switch (f?.category) {
    case 'vegetable':
      return 'veg';
    case 'fruit':
      return 'fruit';
    case 'meat':
    case 'poultry':
    case 'fish':
    case 'egg':
    case 'dairy':
      return 'protein';
    case 'legume':
      return 'legume';
    case 'grain':
      return 'grain';
    case 'nut_seed':
    case 'oil_fat':
      return 'fat';
    default:
      return 'other';
  }
};

const ORDER: Group[] = ['veg', 'legume', 'protein', 'grain', 'fruit', 'fat', 'other'];

export const groupColors = (c: Palette): Record<Group, string> => ({
  veg: c.fiber,
  fruit: c.vitamin,
  protein: c.protein,
  legume: c.mineral,
  grain: c.carbs,
  fat: c.fat,
  other: c.ink3,
});

export const GROUP_LABEL: Record<Group, string> = {
  veg: 'Vegetables',
  fruit: 'Fruit',
  protein: 'Protein',
  legume: 'Legumes',
  grain: 'Grains',
  fat: 'Nuts, seeds & oils',
  other: 'Other',
};

export function plateBreakdown(ingredients: Ingredient[]) {
  const grams = new Map<Group, number>();
  for (const i of ingredients) {
    const g = groupOf(FOOD_INDEX.get(i.foodId));
    grams.set(g, (grams.get(g) ?? 0) + i.grams);
  }
  const total = [...grams.values()].reduce((a, b) => a + b, 0) || 1;
  return ORDER.filter((g) => grams.get(g)).map((g) => ({ group: g, share: grams.get(g)! / total }));
}

export function MealArt({ ingredients, size = 64 }: { ingredients: Ingredient[]; size?: number }) {
  const c = useTheme();
  const colors = groupColors(c);
  const parts = plateBreakdown(ingredients);
  const stroke = Math.max(6, size * 0.16);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const gap = parts.length > 1 ? Math.min(3, circ * 0.01) : 0;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r - stroke / 2 - 2} fill={c.surface2} />
        {parts.map((p) => {
          const len = Math.max(0, p.share * circ - gap);
          const el = (
            <Circle
              key={p.group}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={colors[p.group]}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += p.share * circ;
          return el;
        })}
      </Svg>
    </View>
  );
}
