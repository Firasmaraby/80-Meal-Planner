// A spread check, not a test: SWEEP=1 npx vitest run src/engine/match.sweep.test.ts --reporter=verbose
import { describe, it } from 'vitest';
import { groupFamilies } from './families';
import { matchPlans, REASONS, TASTE_CARDS, type QuizAnswers } from './match';
import { LIBRARY_PLANS, FOOD_INDEX } from '@/state/catalog';

const rnd = (n: number) => Math.floor(Math.random() * n);
const pickOne = <T,>(xs: T[]) => xs[rnd(xs.length)];
describe.skipIf(!process.env.SWEEP)('sweep', () => {
  it('runs', () => {
    const fams = groupFamilies(LIBRARY_PLANS);
    const wins = new Map<string, number>(); const top3 = new Map<string, number>();
    let empty = 0; let inexact = 0; const ix = new Map<string, number>();
    for (let i = 0; i < 500; i++) {
      const reasons = [...new Set([pickOne(REASONS).key, ...(Math.random() < 0.5 ? [pickOne(REASONS).key] : [])])];
      const tastes: QuizAnswers['tastes'] = {};
      for (const c of TASTE_CARDS) tastes[c.group] = Math.random() < 0.55 ? 'yum' : 'nah';
      const diet = pickOne([[], [], [], ['vegetarian'], ['vegan'], ['pescatarian'], ['gluten-free'], ['dairy-free']]);
      const a: QuizAnswers = { reasons, tastes, diet, carbStyle: pickOne(['whole', 'wholegrain', 'any'] as const),
        time: pickOne(['quick', 'medium', 'love'] as const), cookingFor: pickOne(['one', 'two', 'family'] as const),
        budget: pickOne(['cheap', 'middle', 'treat'] as const), lifeStage: reasons.includes('pregnancy') ? pickOne(['pregnant', 'lactating', 'none'] as const) : 'none',
        kcal: 1400 + rnd(17) * 100 };
      const r = matchPlans(fams, a, FOOD_INDEX);
      if (!r.ranked.length) empty++; if (!r.exact) { inexact++; ix.set(a.diet.join('+')||'none', (ix.get(a.diet.join('+')||'none') ?? 0) + 1); }
      if (r.ranked[0]) wins.set(r.ranked[0].family.id, (wins.get(r.ranked[0].family.id) ?? 0) + 1);
      for (const m of r.ranked.slice(0, 3)) top3.set(m.family.id, (top3.get(m.family.id) ?? 0) + 1);
    }
    const lib = fams.filter((f) => f.isLibrary);
    const never = lib.filter((f) => !top3.has(f.id)).map((f) => `${f.id}(${f.style})`);
    console.log('empty', empty, 'inexact', inexact, 'distinct winners', wins.size, 'distinct top3', top3.size, 'of', lib.length);
    console.log('top winners', [...wins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
    console.log('inexact by diet', [...ix.entries()]); console.log('never in top3', never.length, never.join(' '));
  });
});
