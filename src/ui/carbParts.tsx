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
export function CarbChoices({ value, onChange }: { value?: CarbStyle; onChange: (v: CarbStyle) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={CARB_QUESTION} style={{ gap: space.sm }}>
      {CARB_OPTIONS.map((o) => (
        <Choice key={o.key} label={o.label} desc={o.desc} selected={value === o.key} onPress={() => onChange(o.key)} />
      ))}
    </View>
  );
}

/** What the choice keeps on the plate, and what showing more adds, in the person's terms. */
const CARB_COPY: Record<CarbStyle, { main: string; add: string; addWhat: string }> = {
  whole: { main: 'gets its carbs from whole foods: legumes, potatoes, oats and quinoa', add: 'Add grains too', addWhat: 'grains, rice or bread' },
  wholegrain: { main: 'sticks to whole-food carbs and whole grains', add: 'Add white rice and pasta', addWhat: 'white rice, pasta or white bread' },
  any: { main: 'fits your carb choice', add: 'Show more', addWhat: 'more carbs' },
};

/**
 * The person's carb choice, front and centre, with a way to add more. Whole-food carbs is the main path, so the
 * wording says what the list gets its carbs from, not what it leaves out. Render it only when something is hidden by
 * the choice or already revealed.
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
  const copy = CARB_COPY[carbStyle];
  const one = noun.replace(/s$/, '');
  return (
    <View>
      <ChipRow label="Carbs">
        <Chip
          label={carbLabel(carbStyle)}
          accessibilityLabel={`${carbLabel(carbStyle)}, your carb choice. Show only ${noun} that fit it`}
          active={!showMore}
          onPress={() => onChange(false)}
        />
        <Chip label={copy.add} accessibilityLabel={`${copy.add}: also show ${noun} with ${copy.addWhat}`} active={showMore} onPress={() => onChange(true)} />
      </ChipRow>
      <Txt v="caption" dim={1} style={{ marginTop: 6, lineHeight: 18 }} accessibilityLiveRegion="polite">
        {showMore
          ? `Also showing ${noun} with ${copy.addWhat}. They're marked.`
          : `Every ${one} here ${copy.main}.`}
        {!showMore && hiddenCount > 0 ? (
          <Txt v="caption" dim={2}>
            {` Want ${copy.addWhat.replace(/ or /, ' and ')} too? ${hiddenCount} more ${hiddenCount === 1 ? one : noun} ${hiddenCount === 1 ? 'has' : 'have'} them.`}
          </Txt>
        ) : null}
      </Txt>
    </View>
  );
}
