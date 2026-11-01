import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE, migrateState } from './store';

describe('store migration', () => {
  it('starts everyone on whole-food carbs', () => {
    expect(DEFAULT_PROFILE.carbStyle).toBe('whole');
  });

  it('adds carbStyle to a profile saved before version 4 and keeps the rest', () => {
    const saved = { onboarded: true, profile: { ...DEFAULT_PROFILE, name: 'Sam', age: 51, diet: ['vegetarian'], carbStyle: undefined }, logs: [{ id: 'a' }] };
    delete (saved.profile as Record<string, unknown>).carbStyle;
    const out = migrateState(saved, 3) as typeof saved;
    expect(out.profile.carbStyle).toBe('whole');
    expect(out.profile).toMatchObject({ name: 'Sam', age: 51, diet: ['vegetarian'] });
    expect(out.onboarded).toBe(true);
    expect(out.logs).toEqual([{ id: 'a' }]);
  });

  it('does not overwrite a carb style that is already there', () => {
    const out = migrateState({ profile: { ...DEFAULT_PROFILE, carbStyle: 'any' } }, 3) as { profile: { carbStyle: string } };
    expect(out.profile.carbStyle).toBe('any');
    expect((migrateState({ profile: { ...DEFAULT_PROFILE, carbStyle: 'wholegrain' } }, 4) as { profile: { carbStyle: string } }).profile.carbStyle).toBe('wholegrain');
  });

  it('still carries a version 1 state all the way up', () => {
    const out = migrateState({ profile: { sex: 'female', age: 29, focus: 'x', focusStartedAt: 'y', lockedIn: true } }, 1) as { profile: Record<string, unknown> };
    expect(out.profile).not.toHaveProperty('focus');
    expect(out.profile).not.toHaveProperty('lockedIn');
    expect(out.profile).toMatchObject({ sex: 'female', age: 29, carbStyle: 'whole', sizeToMe: true, dislikes: [] });
  });

  it('copes with nothing saved', () => {
    const out = migrateState(undefined, 0) as { profile: { carbStyle: string } };
    expect(out.profile.carbStyle).toBe('whole');
  });
});
