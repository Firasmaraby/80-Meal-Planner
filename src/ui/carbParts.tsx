/** The carb-style question, worded once for onboarding, Food preferences and the filters. */
import { View } from 'react-native';

import type { CarbStyle } from '@/engine/types';

import { Choice } from './Choice';
import { ChipRow } from './planParts';
import { Chip, Txt } from './primitives';
import { space } from './theme';

export const CARB_QUESTION = 'How do you feel about bread, rice and pasta?';

export const CARB_OPTIONS: { key: CarbStyle; label: string; desc: string }[] = [
  { key: 'whole', label: 'Whole-food carbs', desc: 'Legumes, potatoes, oats and quinoa. No bread, rice or pasta.' },
  { key: 'wholegrain', label: 'Whole grains too', desc: 'Adds brown rice, whole-grain bread and whole-wheat pasta.' },
  { key: 'any', label: 'Everything in moderation', desc: 'Adds white rice, pasta and bread, in modest portions next to plenty of vegetables.' },
];

export const carbLabel = (s: CarbStyle) => CARB_OPTIONS.find((o) => o.key === s)?.label ?? s;

/** Short words for a plan that goes beyond what someone chose. */
export const CARB_NEEDS: Record<CarbStyle, string> = {
  whole: 'Whole-food carbs',
  wholegrain: 'Uses whole grains',
  any: 'Uses rice, pasta or bread',
};

/** Three big radio cards, one per answer. */
export function CarbChoices({ value, onChange }: { value: CarbStyle; onChange: (v: CarbStyle) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={CARB_QUESTION} style={{ gap: space.sm }}>
      {CARB_OPTIONS.map((o) => (
        <Choice key={o.key} label={o.label} desc={o.desc} selected={value === o.key} onPress={() => onChange(o.key)} />
      ))}
    </View>
  );
}

/**
 * "My choice" or "Show more": lets someone look past their carb choice, and says plainly what that means.
 * Render it only when something is hidden by the choice or already revealed.
 */
export function CarbFilter({
  carbStyle,
  showMore,
  onChange,
  hiddenCount,
  noun,
}: {
  carbStyle: CarbStyle;
  showMore: boolean;
  onChange: (showMore: boolean) => void;
  hiddenCount: number;
  noun: 'plans' | 'meals';
}) {
  return (
    <View>
      <ChipRow label="Carbs">
        <Chip
          label={`My choice: ${carbLabel(carbStyle)}`}
          accessibilityLabel={`Show only ${noun} that match my carb choice, ${carbLabel(carbStyle)}`}
          active={!showMore}
          onPress={() => onChange(false)}
        />
        <Chip label={`Show more ${noun}`} accessibilityLabel={`Show more ${noun}, beyond my carb choice`} active={showMore} onPress={() => onChange(true)} />
      </ChipRow>
      {showMore ? (
        <Txt v="caption" dim={1} style={{ marginTop: 6, lineHeight: 18 }} accessibilityLiveRegion="polite">
          Showing {noun} that go beyond your choice of {carbLabel(carbStyle).toLowerCase()}. They are marked, and they use more whole grains, rice, pasta or bread.
        </Txt>
      ) : hiddenCount > 0 ? (
        <Txt v="caption" dim={2} style={{ marginTop: 6, lineHeight: 18 }} accessibilityLiveRegion="polite">
          {hiddenCount} more {hiddenCount === 1 ? noun.replace(/s$/, '') : noun} {hiddenCount === 1 ? 'is' : 'are'} hidden by your carb choice. Tap Show more {noun} to see {hiddenCount === 1 ? 'it' : 'them'}.
        </Txt>
      ) : null}
    </View>
  );
}
