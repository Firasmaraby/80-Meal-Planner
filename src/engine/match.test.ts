import { describe, expect, it } from 'vitest';

import { LIBRARY_PLANS, FOOD_INDEX } from '@/state/catalog';

import { dietMatches, groupFamilies } from './families';
import { suggestedProteinPerKg } from './calc';
import { EMPTY_ANSWERS, familyFacts, goalFromReasons, matchPlans, proteinShare, REASONS, TASTE_CARDS, type QuizAnswers } from './match';

const fams = groupFamilies(LIBRARY_PLANS);
const cards = TASTE_CARDS.map((c) => c.group);

// a fixed pseudo-random sequence, so failures repeat
let seed = 7;
const rnd = (n: number) => {
  seed = (seed * 16807) % 2147483647;
  return seed % n;
};
const pick = <T,>(xs: readonly T[]) => xs[rnd(xs.length)];

function randomAnswers(): QuizAnswers {
  const tastes: QuizAnswers['tastes'] = {};
  for (const g of cards) tastes[g] = rnd(2) ? 'yum' : 'nah';
  return {
    reasons: [...new Set([pick(REASONS).key, pick(REASONS).key])],
    tastes,
    diet: pick([[], ['vegetarian'], ['vegan'], ['pescatarian'], ['gluten-free'], ['dairy-free'], ['vegan', 'gluten-free']]),
    carbStyle: pick(['whole', 'wholegrain', 'any'] as const),
    time: pick(['quick', 'medium', 'love'] as const),
    cookingFor: pick(['one', 'two', 'family'] as const),
    budget: pick(['cheap', 'middle', 'treat'] as const),
    lifeStage: pick(['none', 'none', 'none', 'pregnant', 'lactating'] as const),
    kcal: 1400 + rnd(18) * 100,
  };
}

describe('matchPlans', () => {
  it('checks the whole library', () => {
    const r = matchPlans(fams, EMPTY_ANSWERS, FOOD_INDEX);
    expect(r.total).toBe(fams.filter((f) => f.isLibrary).length);
    expect(r.sizes).toBeGreaterThan(r.total);
    expect(r.remaining).toBe(r.total);
  });

  it('never relaxes the diet and never offers a life-stage plan to someone else', () => {
    for (let i = 0; i < 150; i++) {
      const a = randomAnswers();
      const r = matchPlans(fams, a, FOOD_INDEX);
      for (const m of r.ranked) {
        expect(dietMatches(m.family, a.diet), `${m.family.id} for ${a.diet}`).toBe(true);
        const ls = m.family.lifeStage ?? 'none';
        if (ls !== 'none') expect(ls).toBe(a.lifeStage);
      }
    }
  });

  it('always has something for an everyday diet', () => {
    for (let i = 0; i < 150; i++) {
      const a = { ...randomAnswers(), diet: pick([[], ['pescatarian'], ['vegetarian'], ['gluten-free']]) };
      expect(matchPlans(fams, a, FOOD_INDEX).ranked.length, JSON.stringify(a)).toBeGreaterThan(0);
    }
  });

  it('only lowers the counter as answers come in', () => {
    for (let i = 0; i < 60; i++) {
      const full = randomAnswers();
      const steps: QuizAnswers[] = [
        EMPTY_ANSWERS,
        { ...EMPTY_ANSWERS, reasons: full.reasons },
        { ...EMPTY_ANSWERS, reasons: full.reasons, tastes: full.tastes },
        { ...EMPTY_ANSWERS, reasons: full.reasons, tastes: full.tastes, diet: full.diet },
        { ...EMPTY_ANSWERS, reasons: full.reasons, tastes: full.tastes, diet: full.diet, carbStyle: full.carbStyle },
        { ...EMPTY_ANSWERS, reasons: full.reasons, tastes: full.tastes, diet: full.diet, carbStyle: full.carbStyle, time: full.time },
        { ...full, kcal: undefined },
        full,
      ];
      let prev = Infinity;
      for (const s of steps) {
        const r = matchPlans(fams, s, FOOD_INDEX);
        if (!r.exact) break; // the carb choice was loosened: the count starts over from a wider pool
        expect(r.remaining).toBeLessThanOrEqual(prev);
        prev = r.remaining;
      }
    }
  });

  it('keeps the top three varied', () => {
    for (let i = 0; i < 80; i++) {
      const r = matchPlans(fams, { ...randomAnswers(), diet: [] }, FOOD_INDEX);
      const top = r.ranked.slice(0, 3);
      if (top.length < 3) continue;
      const keys = top.map((m) => `${familyFacts(m.family).mainGroup}|${m.family.style ?? 'balanced'}`);
      expect(new Set(keys).size).toBe(3);
    }
  });

  it('follows the taste test', () => {
    const onlyMideast: QuizAnswers = { ...EMPTY_ANSWERS, reasons: ['healthier'], tastes: Object.fromEntries(cards.map((g) => [g, g === 'mideast' ? 'yum' : 'nah'])) };
    expect(familyFacts(matchPlans(fams, onlyMideast, FOOD_INDEX).ranked[0].family).mainGroup).toBe('mideast');
    const onlyLatin: QuizAnswers = { ...onlyMideast, tastes: Object.fromEntries(cards.map((g) => [g, g === 'latin' ? 'yum' : 'nah'])) };
    expect(familyFacts(matchPlans(fams, onlyLatin, FOOD_INDEX).ranked[0].family).mainGroup).toBe('latin');
  });

  it('follows why they came', () => {
    const muscle = matchPlans(fams, { ...EMPTY_ANSWERS, reasons: ['muscle'], kcal: 2800 }, FOOD_INDEX);
    expect(['muscle', 'muscle-plant', 'endurance']).toContain(muscle.ranked[0].family.style);
    expect(muscle.ranked[0].why[0]).toBe('Built for muscle');
    const pregnant = matchPlans(fams, { ...EMPTY_ANSWERS, reasons: ['pregnancy'], lifeStage: 'pregnant', kcal: 2200 }, FOOD_INDEX);
    expect(pregnant.ranked[0].family.lifeStage).toBe('pregnant');
    const everyday = matchPlans(fams, { ...EMPTY_ANSWERS, reasons: ['healthier'], kcal: 2000 }, FOOD_INDEX);
    expect(everyday.ranked[0].family.cuisine).toBe('Global');
  });

  it('never offers ramadan or keto plans unless asked', () => {
    for (let i = 0; i < 100; i++) {
      const a = { ...randomAnswers(), reasons: [pick(['healthier', 'muscle', 'heart', 'energy'] as const)], diet: [] };
      for (const m of matchPlans(fams, a, FOOD_INDEX).ranked.slice(0, 3)) expect(['ramadan', 'keto']).not.toContain(m.family.style);
    }
  });

  it('maps reasons to a goal', () => {
    expect(goalFromReasons(['lose', 'muscle'])).toBe('lose');
    expect(goalFromReasons(['muscle'])).toBe('gain');
    expect(goalFromReasons(['heart'])).toBe('maintain');
  });

  it('words the calories by the goal they were worked out for', () => {
    const base: QuizAnswers = { ...EMPTY_ANSWERS, reasons: ['lose', 'muscle'], kcal: 3000 };
    const gain = matchPlans(fams, { ...base, goal: 'gain' }, FOOD_INDEX).ranked.flatMap((m) => m.why).join(' | ');
    expect(gain).not.toContain('weight loss');
    const lose = matchPlans(fams, { ...base, kcal: 2000, goal: 'lose' }, FOOD_INDEX).ranked.flatMap((m) => m.why).join(' | ');
    expect(lose).not.toContain('building muscle');
  });

  it('puts protein first for muscle builders, within their carb choice', () => {
    const a: QuizAnswers = { ...EMPTY_ANSWERS, reasons: ['muscle'], carbStyle: 'whole', kcal: 3000, goal: 'gain', proteinGoal: 140, lifeStage: 'none' };
    const r = matchPlans(fams, a, FOOD_INDEX);
    const top = r.ranked[0];
    expect(top.protein).toBeGreaterThanOrEqual(140);
    const best = Math.max(...r.ranked.map((m) => proteinShare(m.pick.plan, FOOD_INDEX)));
    expect(proteinShare(top.pick.plan, FOOD_INDEX)).toBeGreaterThan(best - 0.04);
    expect(top.why.join(' ')).toMatch(/High in protein/);
  });
});

describe('suggestedProteinPerKg', () => {
  it('follows the goal', () => {
    expect(suggestedProteinPerKg('gain')).toBe(2);
    expect(suggestedProteinPerKg('maintain', ['training'])).toBe(2);
    expect(suggestedProteinPerKg('lose', ['lose'])).toBe(1.8);
    expect(suggestedProteinPerKg('lose', ['lose', 'muscle'])).toBe(2);
    expect(suggestedProteinPerKg('maintain', ['heart'])).toBe(1.6);
  });
});
