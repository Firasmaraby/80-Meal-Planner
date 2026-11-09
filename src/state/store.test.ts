import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE, migrateState, useStore } from './store';

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

  it('drops the retired halal-friendly and kosher-style filters from a saved profile', () => {
    const out = migrateState({ profile: { ...DEFAULT_PROFILE, diet: ['vegetarian', 'halal-friendly', 'kosher-style'] } }, 4) as { profile: { diet: string[] } };
    expect(out.profile.diet).toEqual(['vegetarian']);
  });
});

describe('membership', () => {
  it('a v5 state saved before memberships loads with the default', () => {
    const saved = { onboarded: true, profile: DEFAULT_PROFILE, logs: [] };
    const out = migrateState(saved, 5) as Record<string, unknown>;
    expect(out).not.toHaveProperty('membership');
    // persist merges the saved state over the initial state, so the default fills the gap
    const merged = { ...useStore.getState(), ...out } as ReturnType<typeof useStore.getState>;
    expect(merged.membership).toEqual({ status: 'none', source: 'demo' });
    expect(merged.onboarded).toBe(true);
  });

  it('starts a week-long demo trial and clears it again', () => {
    useStore.getState().startMembership('annual');
    const m = useStore.getState().membership;
    expect(m).toMatchObject({ status: 'trial', plan: 'annual', source: 'demo' });
    expect(m.startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.renewsOn! > m.startedOn!).toBe(true);
    useStore.getState().resetAll();
    expect(useStore.getState().membership).toEqual({ status: 'none', source: 'demo' });
    useStore.getState().startMembership('monthly');
    useStore.getState().clearMembership();
    expect(useStore.getState().membership.status).toBe('none');
  });
});

describe('quiz answers', () => {
  it('a state saved before the quiz loads without answers, and reset clears them', () => {
    const saved = { onboarded: true, profile: DEFAULT_PROFILE, logs: [] };
    const out = migrateState(saved, 5) as Record<string, unknown>;
    expect(out).not.toHaveProperty('quiz');
    const merged = { ...useStore.getState(), ...out } as ReturnType<typeof useStore.getState>;
    expect(merged.quiz).toBeUndefined();

    useStore.getState().setQuiz({ reasons: ['muscle'], tastes: { med: 'yum' }, diet: [], time: 'quick' });
    expect(useStore.getState().quiz?.reasons).toEqual(['muscle']);
    useStore.getState().resetAll();
    expect(useStore.getState().quiz).toBeUndefined();
  });
});
