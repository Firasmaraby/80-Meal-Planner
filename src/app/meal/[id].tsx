import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { boardProgress, diff, ingredientsTotal, swapOptions, swapGrams, type SwapMode } from '@/engine/calc';
import { BOARD_KEYS, NUTRIENTS } from '@/engine/nutrients';
import type { Ingredient } from '@/engine/types';
import { FOOD_INDEX, SWAP_INDEX, food, foodSearch, swapCandidates } from '@/state/catalog';
import { useDay } from '@/state/day';
import { useLibraryMeal } from '@/state/library';
import { today, useStore } from '@/state/store';
import { Button, Card, Chip, Icon, I, IconButton, Row, Screen, Section, Stepper, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';
import { MicroChip, fmtPct } from '@/ui/viz';

export default function MealScreen() {
  const c = useTheme();
  const { id, date: dateParam } = useLocalSearchParams<{ id: string; date?: string }>();
  const date = dateParam ?? today();
  const day = useDay(date);
  const dm = day.meals.find((m) => m.meal.id === id);
  const editMeal = useStore((s) => s.editMeal);
  const resetMeal = useStore((s) => s.resetMeal);
  const updateAddedMeal = useStore((s) => s.updateAddedMeal);
  const removeMealFromDay = useStore((s) => s.removeMealFromDay);
  const libraryMeal = useLibraryMeal(dm?.key);
  const logMeal = useStore((s) => s.logMeal);

  const [ings, setIngs] = useState<Ingredient[]>(() => dm?.ingredients ?? []);
  const [open, setOpen] = useState<number | null>(null);
  const [mode, setMode] = useState<SwapMode>('calories');
  const [query, setQuery] = useState('');

  const original = (dm?.source === 'added' ? libraryMeal?.meal.ingredients : dm?.meal.ingredients) ?? dm?.ingredients ?? [];
  const now = useMemo(() => ingredientsTotal(ings, FOOD_INDEX), [ings]);
  const base = useMemo(() => ingredientsTotal(original, FOOD_INDEX), [original]);
  const changed = JSON.stringify(ings) !== JSON.stringify(dm?.ingredients ?? []);
  const differsFromPlan = JSON.stringify(ings) !== JSON.stringify(original);

  if (!dm) {
    return (
      <Screen>
        <Txt v="h2">Meal not found</Txt>
        <Button label="Close" style={{ marginTop: space.lg }} onPress={() => router.back()} />
      </Screen>
    );
  }
  const planId = dm.source === 'plan' ? day.plan?.id : undefined;
  const isAdded = dm.source === 'added';

  const top = boardProgress(now, day.profile)
    .filter((x) => x.amount != null)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  // net change vs the original recipe, in RDA points
  const delta = diff(now, base);
  const deltaChips = boardProgress(delta, day.profile, BOARD_KEYS)
    .filter((x) => Math.abs(x.pct) >= 0.05)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5);

  const replace = (i: number, foodId: string, grams: number) => {
    tap('select');
    setIngs(ings.map((x, j) => (j === i ? { ...x, foodId, grams } : x)));
    setOpen(null);
    setQuery('');
  };

  const save = (always: boolean) => {
    if (isAdded) updateAddedMeal(date, dm.meal.id, ings);
    else if (planId) editMeal(date, planId, dm.meal.id, ings, always);
    if (dm.eaten) logMeal(date, dm.meal, ings, planId);
    router.back();
  };

  return (
    <Screen
      bottomInset={40}
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <Txt v="label" dim={1}>
            {dm.meal.slot}
            {dm.meal.prepMinutes ? ` · ${dm.meal.prepMinutes} min` : ''}
          </Txt>
          <IconButton icon={I.close} label="Close" onPress={() => router.back()} />
        </Row>
      }>
      <Txt v="title">{dm.meal.name}</Txt>
      {dm.meal.instructions ? (
        <Txt v="body" dim={1} style={{ marginTop: space.sm }}>
          {dm.meal.instructions}
        </Txt>
      ) : null}

      <Card style={{ marginTop: space.lg }}>
        <Row gap={space.xl}>
          <Stat label="kcal" value={now.kcal} was={differsFromPlan ? base.kcal : undefined} />
          <Stat label="protein g" value={now.protein} was={differsFromPlan ? base.protein : undefined} color={c.protein} />
          <Stat label="fiber g" value={now.fiber} was={differsFromPlan ? base.fiber : undefined} color={c.fiber} />
        </Row>
        <Txt v="label" dim={2} style={{ marginTop: space.lg }}>
          This meal fills
        </Txt>
        <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
          {top.map((t) => (
            <MicroChip key={t.key} k={t.key} pct={t.pct} />
          ))}
        </Row>
        {differsFromPlan && deltaChips.length > 0 && (
          <>
            <Txt v="label" dim={2} style={{ marginTop: space.lg }}>
              Your changes vs the plan
            </Txt>
            <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
              {deltaChips.map((d) => (
                <DeltaChip key={d.key} label={NUTRIENTS[d.key].short} points={d.pct * 100} />
              ))}
            </Row>
          </>
        )}
      </Card>

      <Section
        title="Ingredients"
        action={
          <Row gap={6}>
            <Chip label="Match calories" active={mode === 'calories'} onPress={() => setMode('calories')} style={{ height: 28 }} />
            <Chip label="Keep grams" active={mode === 'grams'} onPress={() => setMode('grams')} style={{ height: 28 }} />
          </Row>
        }>
        <Card style={{ padding: 0 }}>
          {ings.map((ing, i) => {
            const f = food(ing.foodId);
            const group = ing.swapGroup ? SWAP_INDEX.get(ing.swapGroup) : undefined;
            const isOpen = open === i;
            const options = isOpen ? swapOptions(ing, swapCandidates(ing.swapGroup), FOOD_INDEX, day.profile, mode) : [];
            const results = isOpen && query.length > 1 ? foodSearch.search(query, { limit: 6 }) : [];
            const origFood = food(original[i]?.foodId ?? '');
            return (
              <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <View style={{ padding: space.lg, gap: space.sm }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Txt v="bodyStrong">{f?.name ?? ing.foodId}</Txt>
                      {original[i] && original[i].foodId !== ing.foodId && (
                        <Txt v="caption" color={c.vitamin}>
                          swapped from {origFood?.name.split(',')[0] ?? original[i].foodId}
                        </Txt>
                      )}
                      {ing.note ? (
                        <Txt v="caption" dim={2}>
                          {ing.note}
                        </Txt>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        tap('select');
                        setOpen(isOpen ? null : i);
                        setQuery('');
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: isOpen ? c.ink : c.surface2 }}>
                      <Icon name={I.swap} size={13} color={isOpen ? c.bg : c.ink} />
                      <Txt v="caption" color={isOpen ? c.bg : c.ink} style={{ fontWeight: '700' }}>
                        {group ? 'Swap' : 'Replace'}
                      </Txt>
                    </Pressable>
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt v="caption" dim={2}>
                      {Math.round(((f?.n.kcal ?? 0) * ing.grams) / 100)} kcal
                    </Txt>
                    <Stepper value={ing.grams} step={ing.grams >= 100 ? 10 : 5} onChange={(g) => setIngs(ings.map((x, j) => (j === i ? { ...x, grams: g } : x)))} />
                  </Row>
                </View>

                {isOpen && (
                  <View style={{ backgroundColor: c.surface2, padding: space.md, gap: space.sm }}>
                    {group && (
                      <Txt v="label" dim={2} style={{ paddingHorizontal: 4 }}>
                        {group.label}
                      </Txt>
                    )}
                    {options.map((o) => (
                      <Pressable
                        key={o.food.id}
                        onPress={() => replace(i, o.food.id, o.grams)}
                        style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1, gap: 6 })}>
                        <Row style={{ justifyContent: 'space-between' }}>
                          <Txt v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                            {o.food.name}
                          </Txt>
                          <Txt v="caption" dim={1} style={{ fontVariant: ['tabular-nums'] }}>
                            {o.grams} g
                          </Txt>
                        </Row>
                        <Row gap={6} style={{ flexWrap: 'wrap' }}>
                          {o.highlights.slice(0, 4).map((h) => (
                            <DeltaChip key={h.key} label={NUTRIENTS[h.key].short} points={h.pctPoints} />
                          ))}
                          <DeltaChip label="kcal" points={o.delta.kcal ?? 0} raw />
                          <DeltaChip label="protein" points={o.delta.protein ?? 0} raw unit="g" />
                        </Row>
                      </Pressable>
                    ))}
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Replace with any food…"
                      placeholderTextColor={c.ink3}
                      style={{ height: 42, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: c.surface, color: c.ink, borderWidth: 1, borderColor: c.line }}
                    />
                    {results.map((r) => {
                      const g = f ? swapGrams(f, ing.grams, r.food, mode) : ing.grams;
                      return (
                        <Pressable key={r.food.id} onPress={() => replace(i, r.food.id, g)} style={{ paddingVertical: 8, paddingHorizontal: 4 }}>
                          <Row style={{ justifyContent: 'space-between' }}>
                            <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>
                              {r.food.name}
                            </Txt>
                            <Txt v="caption" dim={2}>
                              {g} g
                            </Txt>
                          </Row>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      </Section>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        {changed ? (
          <>
            <Button label={dm.eaten ? 'Update what I ate' : 'Use for today'} icon={I.check} onPress={() => save(false)} />
            {!isAdded && <Button kind="secondary" label="Use every time this meal comes up" onPress={() => save(true)} />}
          </>
        ) : !dm.eaten ? (
          <Button
            label="Ate it"
            icon={I.check}
            onPress={() => {
              tap('success');
              logMeal(date, dm.meal, ings, planId);
              router.back();
            }}
          />
        ) : null}
        {(dm.edited || changed || (isAdded && differsFromPlan)) && (
          <Button
            kind="ghost"
            label="Reset to the original recipe"
            icon={I.undo}
            onPress={() => {
              if (isAdded) updateAddedMeal(date, dm.meal.id, original);
              else if (planId) resetMeal(date, planId, dm.meal.id);
              setIngs(original);
            }}
          />
        )}
        <Button
          kind="ghost"
          label="Remove from this day"
          icon={I.trash}
          onPress={() => {
            removeMealFromDay(date, dm.meal.id);
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

function Stat({ label, value, was, color }: { label: string; value?: number | null; was?: number | null; color?: string }) {
  const c = useTheme();
  const v = Math.round(value ?? 0);
  const d = was != null ? v - Math.round(was) : 0;
  return (
    <View>
      <Txt v="numLg" color={color ?? c.ink}>
        {v}
      </Txt>
      <Txt v="caption" dim={2}>
        {label}
        {d ? `  ${d > 0 ? '+' : ''}${d}` : ''}
      </Txt>
    </View>
  );
}

/** "+35 K" style delta. For board nutrients the value is in % of RDA points. */
function DeltaChip({ label, points, raw, unit = '' }: { label: string; points: number; raw?: boolean; unit?: string }) {
  const c = useTheme();
  const up = points >= 0;
  const value = raw ? `${up ? '+' : ''}${Math.round(points)}${unit}` : `${up ? '+' : '−'}${fmtPct(Math.abs(points) / 100)}`;
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 8, height: 24, borderRadius: radius.pill, backgroundColor: raw ? c.surface2 : up ? c.accentSoft : c.vitaminSoft }}>
      <Txt v="caption" style={{ fontSize: 12, fontWeight: '800' }} color={raw ? c.ink2 : up ? c.accent : c.warn}>
        {value}
      </Txt>
      <Txt v="caption" dim={1} style={{ fontSize: 12 }}>
        {label}
      </Txt>
    </View>
  );
}
