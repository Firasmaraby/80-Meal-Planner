import type { NutrientKey } from './types';

export type NutrientGroup = 'energy' | 'macro' | 'fat' | 'vitamin' | 'mineral';

export interface NutrientInfo {
  key: NutrientKey;
  label: string;
  short: string; // tile label
  unit: 'kcal' | 'g' | 'mg' | 'µg';
  group: NutrientGroup;
  /** appears on the Micronutrient Board */
  board?: boolean;
  /** one-line "why it matters", shown on tap. Kept short on purpose. */
  why?: string;
  /** many food databases don't report this; UI shows "limited data" */
  sparse?: boolean;
}

export const NUTRIENTS: Record<NutrientKey, NutrientInfo> = {
  kcal: { key: 'kcal', label: 'Calories', short: 'kcal', unit: 'kcal', group: 'energy' },
  protein: { key: 'protein', label: 'Protein', short: 'Protein', unit: 'g', group: 'macro' },
  carbs: { key: 'carbs', label: 'Carbohydrate', short: 'Carbs', unit: 'g', group: 'macro' },
  fat: { key: 'fat', label: 'Fat', short: 'Fat', unit: 'g', group: 'macro' },
  sugar: { key: 'sugar', label: 'Sugars', short: 'Sugar', unit: 'g', group: 'macro' },
  satFat: { key: 'satFat', label: 'Saturated fat', short: 'Sat fat', unit: 'g', group: 'fat' },
  mufa: { key: 'mufa', label: 'Monounsaturated fat', short: 'MUFA', unit: 'g', group: 'fat' },
  pufa: { key: 'pufa', label: 'Polyunsaturated fat', short: 'PUFA', unit: 'g', group: 'fat' },
  ala: { key: 'ala', label: 'Omega-3 ALA', short: 'ALA', unit: 'g', group: 'fat' },
  epa: { key: 'epa', label: 'Omega-3 EPA', short: 'EPA', unit: 'g', group: 'fat' },
  dha: { key: 'dha', label: 'Omega-3 DHA', short: 'DHA', unit: 'g', group: 'fat' },
  la: { key: 'la', label: 'Omega-6 (linoleic acid)', short: 'Omega-6', unit: 'g', group: 'fat' },

  fiber: {
    key: 'fiber', label: 'Fiber', short: 'Fiber', unit: 'g', group: 'macro', board: true,
    why: 'Feeds the gut bacteria linked to better long-term health and blunts blood-sugar spikes.',
  },

  vitA: {
    key: 'vitA', label: 'Vitamin A', short: 'A', unit: 'µg', group: 'vitamin', board: true,
    why: 'Vision, skin and immune defence. Orange and dark-green produce are loaded with it.',
  },
  vitC: {
    key: 'vitC', label: 'Vitamin C', short: 'C', unit: 'mg', group: 'vitamin', board: true,
    why: 'Builds collagen with copper, and helps you absorb far more of the iron in plants.',
  },
  vitD: {
    key: 'vitD', label: 'Vitamin D', short: 'D', unit: 'µg', group: 'vitamin', board: true,
    why: 'Supports steroid-hormone production, bone and muscle. Few foods have it, fatty fish is one.',
  },
  vitE: {
    key: 'vitE', label: 'Vitamin E', short: 'E', unit: 'mg', group: 'vitamin', board: true,
    why: 'An antioxidant that protects your cell membranes. Nuts and seeds are the easy win.',
  },
  vitK: {
    key: 'vitK', label: 'Vitamin K', short: 'K', unit: 'µg', group: 'vitamin', board: true,
    why: 'Blood clotting first, keeping calcium out of your arteries second. Triage at work.',
  },
  b1: {
    key: 'b1', label: 'Thiamin (B1)', short: 'B1', unit: 'mg', group: 'vitamin', board: true,
    why: 'Turns carbohydrate into usable energy. Low B1, low gas in the tank.',
  },
  b2: {
    key: 'b2', label: 'Riboflavin (B2)', short: 'B2', unit: 'mg', group: 'vitamin', board: true,
    why: 'Core of the enzymes that release energy from fat, carbs and protein.',
  },
  b3: {
    key: 'b3', label: 'Niacin (B3)', short: 'B3', unit: 'mg', group: 'vitamin', board: true,
    why: 'Part of NAD, which over 400 enzymes depend on for energy metabolism.',
  },
  b5: {
    key: 'b5', label: 'Pantothenic acid (B5)', short: 'B5', unit: 'mg', group: 'vitamin', board: true,
    why: 'Builds coenzyme A, the hub of fat and energy metabolism.',
  },
  b6: {
    key: 'b6', label: 'Vitamin B6', short: 'B6', unit: 'mg', group: 'vitamin', board: true,
    why: 'Helps turn tyrosine into dopamine, your motivation and reward chemistry.',
  },
  b7: {
    key: 'b7', label: 'Biotin (B7)', short: 'B7', unit: 'µg', group: 'vitamin', board: true, sparse: true,
    why: 'Fat and glucose metabolism, plus hair and nails. Eggs, nuts and seeds carry it.',
  },
  folate: {
    key: 'folate', label: 'Folate (B9)', short: 'B9', unit: 'µg', group: 'vitamin', board: true,
    why: 'DNA synthesis and dopamine production. Legumes and leafy greens are packed with it.',
  },
  b12: {
    key: 'b12', label: 'Vitamin B12', short: 'B12', unit: 'µg', group: 'vitamin', board: true,
    why: 'Red blood cells and nerve health. Found almost only in animal foods.',
  },
  choline: {
    key: 'choline', label: 'Choline', short: 'Choline', unit: 'mg', group: 'vitamin', board: true,
    why: 'Builds acetylcholine for muscle control and memory. Eggs are the richest source.',
  },

  calcium: {
    key: 'calcium', label: 'Calcium', short: 'Ca', unit: 'mg', group: 'mineral', board: true,
    why: 'Bones, and every single muscle contraction, including your heartbeat.',
  },
  iron: {
    key: 'iron', label: 'Iron', short: 'Fe', unit: 'mg', group: 'mineral', board: true,
    why: 'Carries oxygen to your muscles and helps make dopamine. Pair plant iron with vitamin C.',
  },
  magnesium: {
    key: 'magnesium', label: 'Magnesium', short: 'Mg', unit: 'mg', group: 'mineral', board: true,
    why: 'A cofactor in more than 300 reactions: energy, sleep, muscle and hormone production.',
  },
  phosphorus: {
    key: 'phosphorus', label: 'Phosphorus', short: 'P', unit: 'mg', group: 'mineral', board: true,
    why: 'Part of ATP, the energy currency every cell spends.',
  },
  potassium: {
    key: 'potassium', label: 'Potassium', short: 'K⁺', unit: 'mg', group: 'mineral', board: true,
    why: 'Balances sodium and blood pressure. Most people fall well short.',
  },
  zinc: {
    key: 'zinc', label: 'Zinc', short: 'Zn', unit: 'mg', group: 'mineral', board: true,
    why: 'Testosterone production, immunity and wound healing.',
  },
  copper: {
    key: 'copper', label: 'Copper', short: 'Cu', unit: 'mg', group: 'mineral', board: true,
    why: 'Works with vitamin C to build collagen, and helps you use iron.',
  },
  manganese: {
    key: 'manganese', label: 'Manganese', short: 'Mn', unit: 'mg', group: 'mineral', board: true,
    why: 'Bone formation and antioxidant enzymes. Oats and whole grains carry plenty.',
  },
  selenium: {
    key: 'selenium', label: 'Selenium', short: 'Se', unit: 'µg', group: 'mineral', board: true,
    why: 'Feeds the selenoproteins, the clearest example of nutrient triage in your body.',
  },
  iodine: {
    key: 'iodine', label: 'Iodine', short: 'I', unit: 'µg', group: 'mineral', board: true, sparse: true,
    why: 'Thyroid hormones, which set your metabolic pace. Seafood, dairy and iodized salt.',
  },
  sodium: { key: 'sodium', label: 'Sodium', short: 'Na', unit: 'mg', group: 'mineral' },
};

/** Ordered list for the Micronutrient Board. */
export const BOARD_KEYS: NutrientKey[] = [
  'vitA', 'vitC', 'vitD', 'vitE', 'vitK',
  'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'folate', 'b12', 'choline',
  'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium',
  'zinc', 'copper', 'manganese', 'selenium', 'iodine',
  'fiber',
];

export const ALL_KEYS = Object.keys(NUTRIENTS) as NutrientKey[];

/** The framework's completion threshold: 80% of the RDA/AI. */
export const COMPLETE_AT = 0.8;
