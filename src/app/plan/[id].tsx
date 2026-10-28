import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { boardProgress, dayPlanTotal, logsGlycemicLoad, macroTargets, mealTotal, pillars, bandLabel } from '@/engine/calc';
import { BOARD_KEYS } from '@/engine/nutrients';
import type { Meal, MealSlot } from '@/engine/types';
import { FOOD_INDEX, food } from '@/state/catalog';
import { usePlan } from '@/state/day';
import { libraryKey } from '@/state/library';
import { useStore } from '@/state/store';
import { useOpenNutrient } from '@/ui/panels';
import { Button, Card, Chip, Icon, I, IconButton, Row, Screen, Section, Txt } from '@/ui/primitives';
import {
  BAR_CLEARANCE,
  BottomBar,
  Fingerprint,
  MacroLine,
  MacroRow,
  MealThumb,
  Pill,
  Segmented,
  SLOT_LABEL,
  SLOT_ORDER,
  SLOT_PLURAL,
  openLibraryMeal,
  planStats,
  tagLabel,
  topMicros,
  useWho,
} from '@/ui/planParts';
import { MAX_WIDTH, radius, space, useTheme } from '@/ui/theme';
import { MicroChip, NutrientTile } from '@/ui/viz';

type Mode = 'day' | 'all';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/plans'));

export default function PlanDetail() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useStore((s) => s.profile);
  const enrollment = useStore((s) => s.enrollment);
  const enroll = useStore((s) => s.enroll);
  const leavePlan = useStore((s) => s.leavePlan);
  const plan = usePlan(id, enrollment?.planId === id ? enrollment.version : undefined);
  const openNutrient = useOpenNutrient();
  const who = useWho(profile);

  const [mode, setMode] = useState<Mode>('day');
  const [sel, setSel] = useState(0);
  const [openMeal, setOpenMeal] = useState<string | null>(null);

  const days = useMemo(() => (plan ? [...plan.days].sort((a, b) => a.day - b.day) : []), [plan]);
  const idx = Math.min(sel, Math.max(0, days.length - 1));
  const day = days[idx];

  const avg = useMemo(() => (plan ? planStats(plan, who) : undefined), [plan, who]);

  const view = useMemo(() => {
    if (!plan || !day) return undefined;
    const total = dayPlanTotal(day, FOOD_INDEX);
    const progress = boardProgress(total, profile);
    const gl = logsGlycemicLoad(
      day.meals.flatMap((m) => m.ingredients.map((i) => ({ foodId: i.foodId, grams: i.grams }))),
      FOOD_INDEX,
    );
    const target = Math.round((plan.band.min + plan.band.max) / 2);
    const pil = pillars(total, gl, profile, macroTargets(profile, target));
    const scored = progress.filter((p) => p.amount != null);
    return { total, progress, pil, done: scored.filter((p) => p.complete).length, of: scored.length };
  }, [plan, day, profile]);

  if (!plan || !day || !view) {
    return (
      <Screen>
        <IconButton icon={I.back} label="Back" onPress={goBack} />
        <Txt v="title" style={{ marginTop: space.lg }}>
          Plan not found
        </Txt>
        <Button label="Browse plans" style={{ marginTop: space.lg }} onPress={() => router.replace('/plans')} />
      </Screen>
    );
  }

  const enrolledHere = enrollment?.planId === plan.id;
  const enrolledElsewhere = !!enrollment && !enrolledHere;
  const start = () => {
    enroll(plan);
    router.replace('/');
  };

  const cols = 5;
  const inner = Math.min(width, MAX_WIDTH) - space.lg * 2 - space.lg * 2;
  const tile = Math.floor((inner - space.sm * (cols - 1)) / cols);
  const byKey = new Map(view.progress.map((p) => [p.key, p]));

  const tone = (s: string) => (s === 'good' ? c.accent : s === 'over' ? c.danger : s === 'watch' ? c.warn : c.ink3);
  const p = view.pil;
  const items = [
    { label: 'Sat fat', value: p.satFat.pct == null ? '—' : `${p.satFat.pct.toFixed(1)}%`, sub: `of kcal · max ${p.satFat.max}%`, status: p.satFat.status },
    { label: 'Omega 6:3', value: p.omega.ratio == null ? '—' : `${p.omega.ratio.toFixed(1)}:1`, sub: 'aim ≤ 4:1', status: p.omega.status },
    { label: 'Glycemic load', value: `${Math.round(p.glycemicLoad.amount)}`, sub: `aim ≤ ${p.glycemicLoad.max}`, status: p.glycemicLoad.status },
    { label: 'Fiber', value: `${Math.round(p.fiber.amount)} g`, sub: `aim ${Math.round(p.fiber.target)} g`, status: p.fiber.status },
    { label: 'Protein', value: `${Math.round(p.protein.amount)} g`, sub: `aim ${Math.round(p.protein.target)} g`, status: p.protein.status },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Screen bottomInset={BAR_CLEARANCE} header={<IconButton icon={I.back} label="Back" onPress={goBack} />}>
        <Txt v="label" dim={2} style={{ marginTop: space.lg }}>
          {plan.cuisine}
        </Txt>
        <Txt v="title" style={{ marginTop: 2 }}>
          {plan.name}
        </Txt>
        {plan.description ? (
          <Txt v="body" dim={1} style={{ marginTop: space.sm }}>
            {plan.description}
          </Txt>
        ) : null}
        <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.md }}>
          <Pill label={`${bandLabel(plan.band)} kcal`} color={c.bg} bg={c.ink} />
          <Pill label={`${days.length} ${days.length === 1 ? 'day' : 'days'}`} />
          {plan.tags.map((t) => (
            <Pill key={t} label={tagLabel(t)} />
          ))}
        </Row>

        {avg && (
          <Card style={{ marginTop: space.lg }}>
            <Row gap={space.lg}>
              <Fingerprint progress={avg.progress} size={12} gap={3} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h3">
                  {avg.covered}/{avg.of} covered
                </Txt>
                <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
                  On an average day, for you. Pick a day below to see it tile by tile.
                </Txt>
              </View>
            </Row>
            <Button
              small
              kind="secondary"
              icon={I.cart}
              label="Grocery list"
              style={{ marginTop: space.md, alignSelf: 'flex-start' }}
              onPress={() => router.push({ pathname: '/grocery', params: { planId: plan.id } })}
            />
          </Card>
        )}

        <View style={{ marginTop: space.xl }}>
          <Segmented<Mode>
            options={[
              { key: 'day', label: 'By day' },
              { key: 'all', label: 'All meals' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>

        {mode === 'all' ? (
          <AllMeals planId={plan.id} days={days} />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -space.lg, marginTop: space.md }}
              contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
              {days.map((d, i) => (
                <Chip key={d.day} label={`Day ${d.day}`} active={i === idx} onPress={() => setSel(i)} />
              ))}
            </ScrollView>

            <Card style={{ marginTop: space.md }}>
              <Txt v="h3">
                Day {day.day}: {view.done} of {view.of} reach 80%
              </Txt>
              <Txt v="caption" dim={2}>
                Each tile is done at 80%: the dashed line.
              </Txt>
              <View style={{ height: 1, backgroundColor: c.line, marginVertical: space.md }} />
              <MacroRow totals={view.total} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
                {BOARD_KEYS.map((k) => {
                  const pr = byKey.get(k);
                  if (!pr) return null;
                  return <NutrientTile key={k} k={k} pct={pr.pct} noData={pr.amount == null} size={tile} onPress={() => openNutrient(k)} />;
                })}
              </View>
            </Card>

            <Section title={`Day ${day.day} meals`}>
              <View style={{ gap: space.md }}>
                {day.meals.map((m) => (
                  <MealRow key={m.id} meal={m} planId={plan.id} open={openMeal === m.id} onToggle={() => setOpenMeal(openMeal === m.id ? null : m.id)} />
                ))}
              </View>
            </Section>
            <Section title="Framework pillars">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {items.map((it) => (
                  <View
                    key={it.label}
                    style={{ flexGrow: 1, flexBasis: '30%', minWidth: 100, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
                    <Row gap={6}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone(it.status) }} />
                      <Txt v="caption" dim={1} style={{ fontWeight: '700', fontSize: 12 }}>
                        {it.label}
                      </Txt>
                    </Row>
                    <Txt v="num" style={{ fontSize: 20, marginTop: 4 }}>
                      {it.value}
                    </Txt>
                    <Txt v="caption" dim={2} style={{ fontSize: 11 }}>
                      {it.sub}
                    </Txt>
                  </View>
                ))}
              </View>
            </Section>

          </>
        )}
      </Screen>

      <BottomBar>
        {enrolledHere ? (
          <Row gap={space.sm}>
            <Button kind="secondary" label="Leave plan" style={{ flex: 1 }} onPress={leavePlan} />
            <View
              accessible
              accessibilityLabel="You're on this plan"
              style={{ flex: 2, height: 50, borderRadius: radius.pill, backgroundColor: c.accentSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
              <Icon name={I.check} size={17} color={c.accent} />
              <Txt v="bodyStrong" color={c.accent} style={{ fontWeight: '700' }}>
                You’re on this plan
              </Txt>
            </View>
          </Row>
        ) : (
          <>
            {enrolledElsewhere && (
              <Txt v="caption" dim={1} style={{ textAlign: 'center' }}>
                Switching starts this plan at Day 1 today.
              </Txt>
            )}
            <Button label={enrolledElsewhere ? 'Switch to this plan' : 'Start this plan'} icon={I.check} onPress={start} />
          </>
        )}
      </BottomBar>
    </View>
  );
}

function MealRow({ meal, planId, open, onToggle }: { meal: Meal; planId: string; open: boolean; onToggle: () => void }) {
  const c = useTheme();
  const profile = useStore((st) => st.profile);
  const who = useWho(profile);
  const totals = useMemo(() => mealTotal(meal, FOOD_INDEX), [meal]);
  const top = useMemo(() => topMicros(totals, who), [totals, who]);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${SLOT_LABEL[meal.slot]}: ${meal.name}. ${open ? 'Hide' : 'Show'} ingredients and instructions`}
        onPress={onToggle}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <MealThumb meal={meal} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label" dim={2}>
                {SLOT_LABEL[meal.slot]}
                {meal.prepMinutes ? `  ·  ${meal.prepMinutes} min` : ''}
              </Txt>
              <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                <Icon name={I.chevron} size={14} color={c.ink3} />
              </View>
            </Row>
            <Txt v="h3">{meal.name}</Txt>
            <MacroLine totals={totals} />
          </View>
        </Row>
        <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={6}>
          {top.map((t) => (
            <MicroChip key={t.key} k={t.key} pct={t.pct} />
          ))}
        </Row>
      </Pressable>
      {open && (
        <View style={{ marginTop: space.md, borderTopWidth: 1, borderTopColor: c.line, paddingTop: space.sm }}>
          <Txt v="label" dim={2} style={{ marginBottom: 2 }}>
            Ingredients
          </Txt>
          {meal.ingredients.map((ing, i) => (
            <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 6 }} gap={space.md}>
              <View style={{ flex: 1 }}>
                <Txt v="body">{food(ing.foodId)?.name ?? ing.foodId}</Txt>
                {ing.note ? (
                  <Txt v="caption" dim={2}>
                    {ing.note}
                  </Txt>
                ) : null}
              </View>
              <Txt v="num" dim={1}>
                {Math.round(ing.grams)} g
              </Txt>
            </Row>
          ))}
          {meal.instructions ? (
            <>
              <Txt v="label" dim={2} style={{ marginTop: space.md, marginBottom: 4 }}>
                How to make it
              </Txt>
              <Txt v="body" dim={1} style={{ lineHeight: 22 }}>
                {meal.instructions}
              </Txt>
            </>
          ) : null}
          <Button
            small
            kind="secondary"
            icon={I.chevron}
            label="Open meal"
            style={{ marginTop: space.md, alignSelf: 'flex-start' }}
            onPress={() => openLibraryMeal(libraryKey(planId, meal.id))}
          />
        </View>
      )}
    </Card>
  );
}

/** Every meal in the plan, grouped by slot. Tap one to open it in the meal library. */
function AllMeals({ planId, days }: { planId: string; days: { day: number; meals: Meal[] }[] }) {
  const groups = useMemo(
    () =>
      SLOT_ORDER.map((slot) => ({
        slot,
        items: days.flatMap((d) => d.meals.filter((m) => m.slot === slot).map((meal) => ({ meal, day: d.day }))),
      })).filter((g) => g.items.length > 0),
    [days],
  );
  return (
    <>
      {groups.map((g) => (
        <Section key={g.slot} title={`${SLOT_PLURAL[g.slot]} · ${g.items.length}`}>
          <View style={{ gap: space.md }}>
            {g.items.map(({ meal, day }) => (
              <MealOpenRow key={meal.id} meal={meal} planId={planId} day={day} slot={g.slot} />
            ))}
          </View>
        </Section>
      ))}
    </>
  );
}

function MealOpenRow({ meal, planId, day, slot }: { meal: Meal; planId: string; day: number; slot: MealSlot }) {
  const c = useTheme();
  const profile = useStore((st) => st.profile);
  const who = useWho(profile);
  const totals = useMemo(() => mealTotal(meal, FOOD_INDEX), [meal]);
  const top = useMemo(() => topMicros(totals, who), [totals, who]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Day ${day}, ${SLOT_LABEL[slot]}: ${meal.name}. Open meal`}
      onPress={() => openLibraryMeal(libraryKey(planId, meal.id))}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <MealThumb meal={meal} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label" dim={2}>
                Day {day}
                {meal.prepMinutes ? `  ·  ${meal.prepMinutes} min` : ''}
              </Txt>
              <Icon name={I.chevron} size={14} color={c.ink3} />
            </Row>
            <Txt v="h3">{meal.name}</Txt>
            <MacroLine totals={totals} />
          </View>
        </Row>
        <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={6}>
          {top.map((t) => (
            <MicroChip key={t.key} k={t.key} pct={t.pct} />
          ))}
        </Row>
      </Card>
    </Pressable>
  );
}
