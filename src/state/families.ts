import { useMemo } from 'react';

import { groupFamilies, type PlanFamily } from '@/engine/families';
import type { CarbStyle, MealPlan } from '@/engine/types';

import { useAllPlans } from './day';
import { useStore } from './store';

/** Every plan, grouped into families (a plan with no family is a family of one). */
export function useFamilies(): PlanFamily[] {
  const plans = useAllPlans();
  return useMemo(() => groupFamilies(plans), [plans]);
}

/** The family a plan belongs to. */
export function useFamilyOf(plan?: MealPlan): PlanFamily | undefined {
  const families = useFamilies();
  return useMemo(() => {
    if (!plan) return undefined;
    const id = plan.familyId ?? plan.id;
    return families.find((f) => f.id === id);
  }, [families, plan]);
}

/** How the person feels about bread, rice and pasta. Anyone who has not been asked yet gets whole-food carbs. */
export function useCarbStyle(): CarbStyle {
  return useStore((s) => s.profile.carbStyle ?? 'whole');
}
