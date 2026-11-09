import { describe, expect, it } from 'vitest';

import { useHealthStore } from './healthStore';
import { useKitchen } from './kitchenStore';
import { startOver } from './startOver';
import { useStore } from './store';

describe('startOver', () => {
  it('clears the quiz, membership, enrollment, onboarding and the other stores', () => {
    const s = useStore.getState();
    s.setQuiz({ reasons: ['energy'] } as never);
    s.startMembership('annual');
    s.enroll({ id: 'p1', version: 1 } as never);
    s.finishOnboarding();
    useKitchen.getState().setHouseholdSize(4);
    useHealthStore.getState().setEnabled(true);
    expect(useStore.getState().onboarded).toBe(true);

    startOver();

    const after = useStore.getState();
    expect(after.onboarded).toBe(false);
    expect(after.quiz).toBeUndefined();
    expect(after.enrollment).toBeUndefined();
    expect(after.membership).toEqual({ status: 'none', source: 'demo' });
    expect(after.logs).toEqual([]);
    expect(useKitchen.getState().householdSize).toBe(1);
    expect(useHealthStore.getState().enabled).toBe(false);
  });
});
