import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { addInto, boardProgress, dayScore, ingredientsTotal } from '@/engine/calc';
import { BOARD_KEYS } from '@/engine/nutrients';
import type { MealSlot, NutrientVector } from '@/engine/types';
import { FOOD_INDEX, food } from '@/state/catalog';
import { useAllPlans, useDay, type DayData } from '@/state/day';
import { useLibraryMeal, type LibraryMeal } from '@/state/library';
import { addDays, today, useStore } from '@/state/store';
import { GROUP_LABEL, groupColors, plateBreakdown } from '@/ui/MealArt';
import { useOpenNutrient } from '@/ui/panels';
import {
  BAR_CLEARANCE,
  BottomBar,
  MacroRow,
  MealThumb,
  Segmented,
  SLOT_LABEL,
  SLOT_ORDER,
  tagLabel,
} from '@/ui/planParts';
import { Button, Card, Chip, Icon, I, IconButton, Row, Screen, Section, Txt, tap, type IconName } from '@/ui/primitives';
import { MAX_WIDTH, radius, space, useTheme } from '@/ui/theme';
import { NutrientTile } from '@/ui/viz';

type When = 'today' | 'tomorrow';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/meals'));

const decode = (raw?: string) => {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/**
 * The library has one entry per distinct meal. A plan can also hold the same meal twice,
 * so a key that isn't in the library is looked up in the plans directly.
 */
function useResolvedMeal(key?: string): LibraryMeal | undefined {
  const fromLibrary = useLibraryMeal(key);
  const plans = useAllPlans();
  return useMemo(() => {
    if (fromLibrary || !key) return fromLibrary;
    for (let i = key.indexOf('~'); i >= 0; i = key.indexOf('~', i + 1)) {
      const plan = plans.find((p) => p.id === key.slice(0, i));
      const meal = plan?.days.flatMap((d) => d.meals).find((m) => m.id === key.slice(i + 1));
      if (plan && meal) {
        return {
          key,
          meal,
          planId: plan.id,
          planName: plan.name,
          cuisine: plan.cuisine,
          tags: plan.tags,
          band: plan.band,
          totals: ingredientsTotal(meal.ingredients, FOOD_INDEX),
          alsoIn: [],
        };
      }
    }
    return undefined;
  }, [fromLibrary, key, plans]);
}

/** Tiles done on a day if `add` is eaten on top of what's planned, minus `minus` when swapping a meal out. */
function boardAfter(day: DayData, add: NutrientVector, minus?: NutrientVector) {
  const v: NutrientVector = { ...day.projected };
  if (minus) {
    for (const k in minus) {
      const key = k as keyof NutrientVector;
      if (v[key] != null) v[key] = (v[key] ?? 0) - (minus[key] ?? 0);
    }
  }
  addInto(v, add);
  return dayScore(boardProgress(v, day.profile));
}

export default function LibraryMealScreen() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const { key: rawKey } = useLocalSearchParams<{ key: string }>();
  const lm = useResolvedMeal(decode(rawKey));
  const profile = useStore((s) => s.profile);
  const favoriteMeals = useStore((s) => s.favoriteMeals);
  const toggleFavoriteMeal = useStore((s) => s.toggleFavoriteMeal);
  const openNutrient = useOpenNutrient();

  const [open, setOpen] = useState(false);

  if (!lm) {
    return (
      <Screen>
        <IconButton icon={I.back} label="Back" onPress={goBack} />
        <Txt v="title" style={{ marginTop: space.lg }}>
          Meal not found
        </Txt>
        <Txt v="body" dim={1} style={{ marginTop: space.sm }}>
          It may have been in a plan that was updated.
        </Txt>
        <Button label="Browse meals" style={{ marginTop: space.lg }} onPress={() => router.replace('/meals')} />
      </Screen>
    );
  }

  const saved = favoriteMeals.includes(lm.key);
  const { meal } = lm;
  const plate = plateBreakdown(meal.ingredients).filter((p) => p.share >= 0.01);
  const colors = groupColors(c);
  const progress = boardProgress(lm.totals, profile);
  const byKey = new Map(progress.map((p) => [p.key, p]));
  const hasNoData = progress.some((p) => p.amount == null);

  const cols = 5;
  const inner = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const tile = Math.floor((inner - space.sm * (cols - 1)) / cols);

  return (
    <View style={{ flex: 1 }}>
      <Screen
        bottomInset={open ? 460 : BAR_CLEARANCE}
        header={
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton icon={I.back} label="Back" onPress={goBack} />
            <IconButton
              icon={I.bookmark}
              tone={saved ? 'filled' : undefined}
              label={saved ? 'Remove from saved meals' : 'Save this meal'}
              onPress={() => toggleFavoriteMeal(lm.key)}
            />
          </Row>
        }>
        <Card style={{ marginTop: space.lg, alignItems: 'center', gap: space.lg, paddingVertical: space.xl }}>
          <MealThumb meal={meal} size={176} />
          <View
            accessible
            accessibilityLabel={`On the plate: ${plate.map((p) => `${GROUP_LABEL[p.group]} ${Math.round(p.share * 100)} percent`).join(', ')}`}
            style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space.lg, rowGap: 6 }}>
            {plate.map((p) => (
              <Row key={p.group} gap={6}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[p.group] }} />
                <Txt v="caption" dim={1}>
                  {GROUP_LABEL[p.group]}{' '}
                  <Txt v="caption" style={{ fontWeight: '800' }}>
                    {Math.round(p.share * 100)}%
                  </Txt>
                </Txt>
              </Row>
            ))}
          </View>
        </Card>

        <Txt v="label" dim={2} style={{ marginTop: space.lg }}>
          {SLOT_LABEL[meal.slot]}
          {meal.prepMinutes ? `  ·  ${meal.prepMinutes} min` : ''}
          {lm.cuisine ? `  ·  ${lm.cuisine}` : ''}
        </Txt>
        <Txt v="title" style={{ marginTop: 2 }}>
          {meal.name}
        </Txt>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`From the ${lm.planName} plan. Open plan`}
          onPress={() => {
            tap('select');
            router.push({ pathname: '/plan/[id]', params: { id: lm.planId } });
          }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.sm, opacity: pressed ? 0.7 : 1, alignSelf: 'flex-start' })}>
          <Txt v="bodyStrong" color={c.accent}>
            From the {lm.planName} plan
          </Txt>
          <Icon name={I.chevron} size={13} color={c.accent} />
        </Pressable>
        {lm.alsoIn.length > 0 && (
          <Txt v="caption" dim={2} style={{ marginTop: 2 }}>
            Also in {lm.alsoIn.join(', ')}
          </Txt>
        )}
        {lm.tags.length > 0 && (
          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
            {lm.tags.slice(0, 4).map((t) => (
              <Tag key={t} label={tagLabel(t)} />
            ))}
          </Row>
        )}

        {meal.instructions ? (
          <Section title="How to make it">
            <Txt v="body" style={{ lineHeight: 23 }}>
              {meal.instructions}
            </Txt>
          </Section>
        ) : null}

        <Section title="Macros">
          <Card>
            <MacroRow totals={lm.totals} />
          </Card>
        </Section>

        <Section title="What this meal fills">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {BOARD_KEYS.map((k) => {
              const p = byKey.get(k);
              if (!p) return null;
              return <NutrientTile key={k} k={k} pct={p.pct} noData={p.amount == null} size={tile} onPress={() => openNutrient(k)} />;
            })}
          </View>
          <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
            Each tile is a share of your daily need from this meal alone. Fill past the dashed line and it counts as done.
            {hasNoData ? ' “No data” means the database doesn’t measure it, not that it’s zero.' : ''}
          </Txt>
        </Section>

        <Section title="Ingredients">
          <Card style={{ paddingVertical: space.sm }}>
            {meal.ingredients.map((ing, i) => (
              <Row
                key={i}
                gap={space.md}
                style={{ justifyContent: 'space-between', paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
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
          </Card>
        </Section>
      </Screen>

      <BottomBar>
        {open ? (
          <AddToDay lm={lm} onClose={() => setOpen(false)} />
        ) : (
          <Button label="Add to today" icon={I.add} onPress={() => setOpen(true)} />
        )}
      </BottomBar>
    </View>
  );
}

function Tag({ label }: { label: string }) {
  const c = useTheme();
  return (
    <View style={{ paddingHorizontal: 9, height: 24, borderRadius: radius.pill, backgroundColor: c.surface2, justifyContent: 'center' }}>
      <Txt v="caption" dim={1} style={{ fontSize: 12, fontWeight: '700' }}>
        {label}
      </Txt>
    </View>
  );
}

interface Added {
  date: string;
  uid: string;
  when: When;
  replacedId?: string;
}

/** The inline picker: when, which slot, and whether to replace the plan's meal or add on top. */
function AddToDay({ lm, onClose }: { lm: LibraryMeal; onClose: () => void }) {
  const c = useTheme();
  const addMealToDay = useStore((s) => s.addMealToDay);
  const removeMealFromDay = useStore((s) => s.removeMealFromDay);
  const restorePlanMeal = useStore((s) => s.restorePlanMeal);

  const [when, setWhen] = useState<When>('today');
  const [slot, setSlot] = useState<MealSlot>(lm.meal.slot);
  const [added, setAdded] = useState<Added | null>(null);

  const dateToday = today();
  const dateTomorrow = addDays(dateToday, 1);
  const dayToday = useDay(dateToday);
  const dayTomorrow = useDay(dateTomorrow);
  const date = when === 'today' ? dateToday : dateTomorrow;
  const day = when === 'today' ? dayToday : dayTomorrow;

  const planMeals = day.meals.filter((m) => m.source === 'plan' && m.meal.slot === slot);
  const already = day.meals.some((m) => m.source === 'added' && m.key === lm.key);
  const whenWord = when === 'today' ? 'today' : 'tomorrow';

  const before = dayScore(day.projectedProgress);
  const asExtra = boardAfter(day, lm.totals);
  const impact = (after: ReturnType<typeof dayScore>) =>
    after.done === before.done
      ? `Your board ${day.plan ? `after ${whenWord}’s plan ` : ''}stays at ${before.done} of ${after.of}`
      : `Your board ${day.plan ? `after ${whenWord}’s plan` : whenWord}: ${before.done} → ${after.done} of ${after.of}`;

  const add = (replaces?: string) => {
    tap('success');
    const uid = addMealToDay(date, lm.key, lm.meal, { slot, replaces });
    setAdded({ date, uid, when, replacedId: replaces });
  };
  const undo = () => {
    if (!added) return;
    if (added.replacedId) restorePlanMeal(added.date, added.replacedId);
    else removeMealFromDay(added.date, added.uid);
    setAdded(null);
  };

  if (added) {
    return (
      <View style={{ gap: space.md }}>
        <Row gap={space.sm}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={I.check} size={14} color={c.accent} />
          </View>
          <Txt v="h3" style={{ flex: 1 }} accessibilityLiveRegion="polite">
            Added to {added.when === 'today' ? 'today' : 'tomorrow'}
          </Txt>
          <IconButton icon={I.close} label="Close" onPress={onClose} />
        </Row>
        <Row gap={space.sm}>
          <Button kind="secondary" label="Undo" icon={I.undo} onPress={undo} />
          <Button
            label={added.when === 'today' ? 'View in Today' : 'Go to Today'}
            icon={I.chevron}
            style={{ flex: 1 }}
            onPress={() => router.navigate('/')}
          />
        </Row>
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">Add to your day</Txt>
        <IconButton icon={I.close} label="Close" onPress={onClose} />
      </Row>
      <Segmented<When>
        options={[
          { key: 'today', label: 'Today' },
          { key: 'tomorrow', label: 'Tomorrow' },
        ]}
        value={when}
        onChange={setWhen}
      />
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {SLOT_ORDER.map((s) => (
          <Chip key={s} label={SLOT_LABEL[s]} active={slot === s} onPress={() => setSlot(s)} style={{ height: 32 }} />
        ))}
      </Row>

      {planMeals.length > 0 ? (
        <View style={{ gap: space.md }}>
          {planMeals.map((pm) => (
            <Option
              key={pm.meal.id}
              label={`Replace ${pm.meal.name}`}
              icon={I.swap}
              kind="primary"
              note={impact(boardAfter(day, lm.totals, pm.totals))}
              onPress={() => add(pm.meal.id)}
            />
          ))}
          <Option label="Add as extra" icon={I.add} kind="secondary" note={impact(asExtra)} onPress={() => add()} />
        </View>
      ) : (
        <Option label={`Add to ${SLOT_LABEL[slot].toLowerCase()}`} icon={I.add} kind="primary" note={impact(asExtra)} onPress={() => add()} />
      )}
      {already && (
        <Txt v="caption" dim={2}>
          This meal is already on your day. Adding it again makes a second serving.
        </Txt>
      )}
    </View>
  );
}

/** A full-width action whose label may be long (it holds a meal name), with its board impact underneath. */
function Option({ label, note, kind, icon, onPress }: { label: string; note: string; kind: 'primary' | 'secondary'; icon: IconName; onPress: () => void }) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.ink : c.surface2;
  const fg = kind === 'primary' ? c.bg : c.ink;
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={note}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          minHeight: 50,
          paddingVertical: space.sm,
          paddingHorizontal: space.lg,
          borderRadius: radius.pill,
          backgroundColor: bg,
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}>
        <Icon name={icon} size={17} color={fg} />
        <Txt v="bodyStrong" color={fg} numberOfLines={2} style={{ fontWeight: '700', flexShrink: 1, textAlign: 'center' }}>
          {label}
        </Txt>
      </Pressable>
      <Txt v="caption" dim={1} style={{ textAlign: 'center' }}>
        {note}
      </Txt>
    </View>
  );
}
