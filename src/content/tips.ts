/**
 * Micro-education. Short, never preachy, written in the voice of the framework.
 * Contextual tips are chosen from what the user actually ate today.
 */
import type { DayData } from '@/state/day';
import { FOOD_INDEX } from '@/state/catalog';

export interface Tip {
  id: string;
  title: string;
  body: string;
}

export const TIPS: Tip[] = [
  { id: 'why80', title: 'Why 80%, not 100%?', body: 'The RDA is set about 20% above what the average person needs. Hitting 80% of it lands you around 96% of the typical requirement. 80% is the real bar.' },
  { id: 'micro-size', title: 'Micro in size, not importance', body: 'Vitamins and minerals are the cofactors behind thousands of reactions: hormones, energy, sleep, recovery. Calories are the fuel. These are the mechanics.' },
  { id: 'triage', title: 'Your body triages', body: 'Run short on vitamin K and your body keeps blood clotting going while artery maintenance waits. Short-term survival wins, and long-term health pays.' },
  { id: 'bingo', title: 'Food as a bingo card', body: 'Look at your plate as vitamins and minerals. Filling the board each day pushes you to eat foods you never would have picked.' },
  { id: 'gl', title: 'Load, not just index', body: 'Glycemic load = GI × the carbs you actually eat. Watermelon has a high GI but a small load. Portion matters.' },
  { id: 'fiber', title: 'Fiber counts as a micro', body: 'More fiber, legumes and greens feed the gut bacteria tied to better long-term health. People often find their palate shifts too.' },
  { id: 'fish', title: 'Twice a week', body: 'Fatty fish twice a week is the easiest way to bring your omega-6:3 ratio toward 4:1.' },
  { id: 'consistency', title: 'Tuesday-proof', body: 'Chasing 100% every day breaks the first time life gets in the way. 80% is the target you can still hit on a bad day. Consistency beats perfection.' },
  { id: 'dopamine', title: 'Motivation is chemistry', body: 'Your body needs iron, B6 and folate to turn tyrosine into dopamine, the driver of motivation and reward.' },
  { id: 'collagen', title: 'Skin, tendons, joints', body: 'Collagen needs vitamin C and copper. Kiwi and cashews in the same day covers both.' },
  { id: 'muscle', title: 'Building muscle?', body: 'Vitamin D, zinc and magnesium all support your natural steroid-hormone production.' },
  { id: 'satfat', title: 'Sat fat hides', body: 'Protein bars, creamy coffees, coconut milk and fatty beef add up fast. Check where yours actually comes from.' },
];

/** Pick the most relevant tip for today, falling back to a daily rotation. */
export function tipFor(day: DayData): Tip {
  const ate = (pred: (id: string) => boolean) => day.logs.some((l) => pred(l.foodId));
  const has = (tag: string) => (id: string) => !!FOOD_INDEX.get(id)?.tags?.includes(tag as never);
  const vitCRich = (id: string) => (FOOD_INDEX.get(id)?.n.vitC ?? 0) >= 30;

  if (ate(has('plant_iron')) && ate(vitCRich))
    return { id: 'pair-yes', title: 'Nice pairing', body: 'You had plant iron and vitamin C today. The C helps you absorb far more of that iron.' };
  if (ate(has('plant_iron')) && !ate(vitCRich))
    return { id: 'pair-no', title: 'Pair it up', body: 'You had plant iron today. Add something rich in vitamin C, like kiwi, orange, strawberries or red pepper, to absorb more of it.' };
  if (day.pillars.satFat.status === 'over')
    return TIPS.find((t) => t.id === 'satfat')!;
  if (day.pillars.omega.status === 'over')
    return TIPS.find((t) => t.id === 'fish')!;

  const n = Number(day.date.replaceAll('-', '')) % TIPS.length;
  return TIPS[n];
}

export interface LearnCard {
  id: string;
  kicker: string;
  title: string;
  paragraphs: string[];
}

export const LEARN: LearnCard[] = [
  {
    id: 'framework',
    kicker: 'The framework',
    title: 'Micros first',
    paragraphs: [
      'Most nutrition starts with calories and macros. This app starts with what your body needs to thrive: vitamins, minerals and fiber.',
      'Make hitting those the goal and you end up eating far more fruit, vegetables, legumes and nuts than you planned. Fat loss, muscle, energy and mood follow from there.',
      'The pillars: hit 80% of your vitamin and mineral needs every day. Keep saturated fat in check. Aim for an omega-6:3 ratio around 4:1. Favour low-glycemic carbs. Build on a high-protein baseline.',
    ],
  },
  {
    id: 'why80',
    kicker: 'The number',
    title: 'Why 80%?',
    paragraphs: [
      'The RDA is not the average requirement. It is set two standard deviations above it (the EAR), so it covers 97–98% of people. That makes it about 1.2× what the typical person needs.',
      '80% of the RDA is about 96% of the average requirement. You clear the real bar, and the rest is insurance.',
      'It also survives real life. A target you can still hit on a stressful Tuesday keeps you consistent, and consistency is what drives results.',
    ],
  },
  {
    id: 'triage',
    kicker: 'The theory',
    title: 'Triage',
    paragraphs: [
      'Bruce Ames proposed that when micronutrients run short, the body rations them like a battlefield medic: short-term survival first, long-term maintenance later.',
      'Vitamin K goes to blood clotting before it goes to keeping calcium out of your arteries. Selenium goes to the most essential selenoproteins first, and the rest drop off.',
      "It's a theory, not settled law. But the worst case of acting on it is that you eat far more whole, unprocessed food. That's the bet behind every plan here.",
    ],
  },
  {
    id: 'gl',
    kicker: 'Carbs',
    title: 'Glycemic load',
    paragraphs: [
      'Glycemic index measures how fast a carb raises blood sugar. Glycemic load multiplies that by how much carbohydrate you actually eat.',
      'Chickpeas, black beans, lentils, quinoa and oats are low-glycemic and full of fiber. Swapping them in for white rice, pasta and bread is one of the strongest moves for blood sugar.',
    ],
  },
  {
    id: 'omega',
    kicker: 'Fats',
    title: 'The 4:1 ratio',
    paragraphs: [
      'Omega-6 and omega-3 fats compete for the same enzymes. Modern diets often run 15:1 or higher.',
      'Fatty fish twice a week, plus walnuts, chia or flax, brings the ratio back toward 4:1. Cutting seed-oil-heavy processed food helps from the other side.',
    ],
  },
];
