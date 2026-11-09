import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { SIZE_LABEL, type PlanFamily } from '@/engine/families';
import { matchPlans, type Match, type Nudge, type QuizAnswers } from '@/engine/match';
import type { MealPlan } from '@/engine/types';
import { FOOD_INDEX } from '@/state/catalog';

import { MealArt } from '../MealArt';
import { Pill, SLOT_LABEL } from '../planParts';
import { Button, Card, Chip, I, Row, Txt, tap } from '../primitives';
import { space, useTheme } from '../theme';
import { LiveBoard } from './LiveBoard';
import { PlanCounter } from './PlanCounter';

const NUDGES: { key: Nudge; label: string }[] = [
  { key: 'quicker', label: 'Quicker' },
  { key: 'adventurous', label: 'More adventurous' },
  { key: 'cheaper', label: 'Cheaper' },
];

const fmt = (n: number) => n.toLocaleString('en-CA');
const kcalRange = (p: MealPlan) => `${fmt(p.band.min)} to ${fmt(p.band.max)} kcal`;
const sizeLabel = (p: MealPlan) => (p.size ? `${SIZE_LABEL[p.size]} size` : undefined);

function Bullet({ text }: { text: string }) {
  const c = useTheme();
  return (
    <Row gap={8} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.ink3, marginTop: 8 }} />
      <Txt v="body" style={{ flex: 1 }}>
        {text}
      </Txt>
    </Row>
  );
}

function DayPreview({ plan }: { plan: MealPlan }) {
  const meals = useMemo(() => [...plan.days].sort((a, b) => a.day - b.day)[0]?.meals ?? [], [plan]);
  if (!meals.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Txt v="label" dim={2}>
        A day on this plan
      </Txt>
      {meals.map((m) => (
        <Row key={m.id} gap={space.md}>
          <MealArt ingredients={m.ingredients} size={38} />
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" numberOfLines={2} style={{ lineHeight: 19 }}>
              {m.name}
            </Txt>
            <Txt v="caption" dim={2}>
              {SLOT_LABEL[m.slot]}
            </Txt>
          </View>
        </Row>
      ))}
    </View>
  );
}

function TopCard({ match, onStart }: { match: Match; onStart: (p: MealPlan) => void }) {
  const { family, pick, why } = match;
  const c = useTheme();
  return (
    <Card style={{ gap: space.md, borderColor: c.ink, borderWidth: 1.5 }}>
      <View>
        <Txt v="label" dim={2}>
          Your top match
        </Txt>
        <Txt v="title" style={{ marginTop: 4 }}>
          {family.name}
        </Txt>
        <Txt v="caption" dim={1} style={{ marginTop: 2 }}>
          {family.cuisine}
        </Txt>
      </View>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {sizeLabel(pick.plan) ? <Pill label={sizeLabel(pick.plan)!} color={c.bg} bg={c.ink} /> : null}
        <Pill label={kcalRange(pick.plan)} />
      </Row>
      {why.length ? (
        <View style={{ gap: 6 }}>
          <Txt v="label" dim={2}>
            Why this fits you
          </Txt>
          {why.slice(0, 3).map((w) => (
            <Bullet key={w} text={w} />
          ))}
        </View>
      ) : null}
      <DayPreview plan={pick.plan} />
      <Button label="Start this plan" icon={I.check} onPress={() => onStart(pick.plan)} />
    </Card>
  );
}

function AltCard({ match, onStart }: { match: Match; onStart: (p: MealPlan) => void }) {
  const { family, pick, why } = match;
  return (
    <Card style={{ gap: space.sm }}>
      <View>
        <Txt v="label" dim={2}>
          {family.cuisine}
        </Txt>
        <Txt v="h2" style={{ marginTop: 2 }}>
          {family.name}
        </Txt>
      </View>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {sizeLabel(pick.plan) ? <Pill label={sizeLabel(pick.plan)!} /> : null}
        <Pill label={kcalRange(pick.plan)} />
      </Row>
      {why[0] ? <Txt v="caption" dim={1}>
          {why[0]}
        </Txt> : null}
      <Button kind="secondary" small label="Start this plan" onPress={() => onStart(pick.plan)} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

/**
 * The reveal: the counter lands, the board fills past 80% tile by tile, then one top match and two different
 * alternatives, each with why it fits. A nudge re-ranks without asking anything new.
 */
export function MatchReveal({
  families,
  answers,
  kcal,
  protein,
  band,
  onStart,
}: {
  families: PlanFamily[];
  answers: QuizAnswers;
  kcal: number;
  protein: number;
  band: { min: number; max: number };
  onStart: (plan: MealPlan) => void;
}) {
  const c = useTheme();
  const [nudge, setNudge] = useState<Nudge | undefined>();
  const result = useMemo(() => matchPlans(families, answers, FOOD_INDEX, nudge), [families, answers, nudge]);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLanded(true), 250);
    const b = setTimeout(() => tap('success'), 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const [top, ...rest] = result.ranked;
  const alts = rest.slice(0, 2);
  const looseWord = answers.carbStyle === 'whole' ? 'whole-food-carb' : 'carb';

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <PlanCounter value={landed ? result.remaining : result.total} from={result.total} ms={700} size={52} />
        <Animated.View entering={FadeIn.delay(1300).duration(400)} style={{ flex: 1 }}>
          <Txt v="bodyStrong" style={{ lineHeight: 21 }}>
            {`We checked all ${result.total} plans and ${result.sizes} sizes.`}
          </Txt>
        </Animated.View>
      </View>

      <LiveBoard progress={1} complete cols={9} labels gap={5} tileHeight={38} />

      <Animated.View entering={FadeIn.delay(1500).duration(400)}>
        <Card style={{ paddingVertical: space.md }}>
          <Row gap={space.xl} style={{ flexWrap: 'wrap' }}>
            <View>
              <Txt v="label" dim={2}>
                Your daily target
              </Txt>
              <Txt v="numLg">
                {fmt(kcal)}
                <Txt v="caption" dim={2}>
                  {' '}kcal
                </Txt>
              </Txt>
            </View>
            <View>
              <Txt v="label" dim={2}>
                Protein
              </Txt>
              <Txt v="numLg" color={c.protein}>
                {protein}
                <Txt v="caption" dim={2}>
                  {' '}g
                </Txt>
              </Txt>
            </View>
          </Row>
          <Txt v="caption" dim={2} style={{ marginTop: space.sm }}>
            {`Plan band: ${fmt(band.min)} to ${fmt(band.max)} kcal`}
          </Txt>
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(1700).duration(400)} style={{ gap: space.md }}>
        <View style={{ gap: space.sm }}>
          <Txt v="label" dim={1}>
            Not quite right? Nudge it
          </Txt>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {NUDGES.map((n) => (
              <Chip key={n.key} label={n.label} active={nudge === n.key} onPress={() => setNudge(nudge === n.key ? undefined : n.key)} />
            ))}
          </Row>
          {!result.exact ? (
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              {`No ${looseWord} plan fits all your answers yet, so these include some ${looseWord === 'carb' ? 'other carbs' : 'grains'}.`}
            </Txt>
          ) : null}
        </View>

        <Animated.View key={nudge ?? 'none'} entering={FadeInDown.duration(320)} style={{ gap: space.md }}>
          {top ? (
            <>
              <TopCard match={top} onStart={onStart} />
              {alts.length ? (
                <Txt v="label" dim={1} style={{ marginTop: space.sm }}>
                  Or try one of these
                </Txt>
              ) : null}
              {alts.map((m) => (
                <AltCard key={m.family.id} match={m} onStart={onStart} />
              ))}
            </>
          ) : (
            <Card>
              <Txt v="h3">No plans to show yet</Txt>
              <Txt v="caption" dim={1} style={{ marginTop: 2 }}>
                Browse the full library from the Plans tab.
              </Txt>
            </Card>
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
}
