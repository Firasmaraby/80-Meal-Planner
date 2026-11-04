import { describe, expect, it } from 'vitest';

import { kcalBucketOf, planCollection } from './browse';

type Fam = Parameters<typeof planCollection>[0];
const fam = (style: unknown, cuisine: string) => ({ style, cuisine }) as Fam;

describe('planCollection', () => {
  it('puts any special style in diet', () => {
    expect(planCollection(fam('vegan', 'Global'))).toBe('diet');
    expect(planCollection(fam('vegan', 'Mexican'))).toBe('diet');
  });

  it('puts balanced global plans in everyday', () => {
    expect(planCollection(fam('balanced', 'Global'))).toBe('everyday');
  });

  it('treats a missing style as balanced', () => {
    expect(planCollection(fam(undefined, 'Mexican'))).toBe('cuisine');
    expect(planCollection(fam(undefined, 'Global'))).toBe('everyday');
  });

  it('ignores case and padding in the cuisine', () => {
    expect(planCollection(fam('balanced', 'global'))).toBe('everyday');
    expect(planCollection(fam(undefined, ' GLOBAL '))).toBe('everyday');
  });
});

describe('kcalBucketOf', () => {
  it('uses inclusive lower edges', () => {
    expect(kcalBucketOf(0)).toBe('under400');
    expect(kcalBucketOf(399.9)).toBe('under400');
    expect(kcalBucketOf(400)).toBe('400-600');
    expect(kcalBucketOf(599)).toBe('400-600');
    expect(kcalBucketOf(600)).toBe('600-800');
    expect(kcalBucketOf(800)).toBe('800+');
    expect(kcalBucketOf(1500)).toBe('800+');
  });
});
