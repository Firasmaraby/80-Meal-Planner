import { Platform, useColorScheme } from 'react-native';

import type { NutrientGroup } from '@/engine/nutrients';

/**
 * Eighty design tokens.
 * Warm paper + ink, with three nutrient hues: vitamins (citrus), minerals (sea),
 * fiber (leaf). Green is reserved for one meaning only: "complete" (crossed 80%).
 */
const light = {
  bg: '#F6F4EE',
  surface: '#FFFFFF',
  surface2: '#EFECE4',
  ink: '#15201B',
  ink2: '#56615B',
  ink3: '#8B938E',
  line: '#E4E0D6',
  accent: '#178A55',
  accentInk: '#FFFFFF',
  accentSoft: '#DDF0E5',
  vitamin: '#E28A22',
  vitaminSoft: '#FBEBD6',
  mineral: '#2A8C9C',
  mineralSoft: '#D8EDF0',
  fiber: '#6C9A2A',
  fiberSoft: '#E6F0D6',
  protein: '#5855D6',
  carbs: '#E0A82E',
  fat: '#D46A55',
  warn: '#C9761C',
  danger: '#BF4339',
  shadow: 'rgba(21,32,27,0.08)',
};

const dark: typeof light = {
  bg: '#0C110F',
  surface: '#151C19',
  surface2: '#1C2521',
  ink: '#EDF2EE',
  ink2: '#A5AFA9',
  ink3: '#6D7772',
  line: '#26302B',
  accent: '#3CC27E',
  accentInk: '#06140D',
  accentSoft: '#163527',
  vitamin: '#F2A44A',
  vitaminSoft: '#3A2914',
  mineral: '#4DB6C4',
  mineralSoft: '#12323A',
  fiber: '#94C24F',
  fiberSoft: '#24331A',
  protein: '#8B88F0',
  carbs: '#EBC15C',
  fat: '#E58A76',
  warn: '#E3973F',
  danger: '#E2675C',
  shadow: 'rgba(0,0,0,0.4)',
};

export type Palette = typeof light;
export const palettes = { light, dark };

export function useTheme(): Palette & { scheme: 'light' | 'dark' } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { ...palettes[scheme], scheme };
}

export function groupColor(c: Palette, group: NutrientGroup | 'fiber') {
  if (group === 'vitamin') return { fg: c.vitamin, soft: c.vitaminSoft };
  if (group === 'mineral') return { fg: c.mineral, soft: c.mineralSoft };
  return { fg: c.fiber, soft: c.fiberSoft };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const font = {
  rounded: Platform.select({ ios: 'ui-rounded', web: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif', default: undefined }),
  sans: Platform.select({ web: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', default: undefined }),
};

export const MAX_WIDTH = 560;
