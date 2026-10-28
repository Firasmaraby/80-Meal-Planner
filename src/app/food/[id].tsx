import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { boardProgress, foodHighlights, glycemicLoad, omega3, omegaRatio, scaled } from '@/engine/calc';
import { NUTRIENTS } from '@/engine/nutrients';
import type { FoodTag, MealSlot, NutrientKey } from '@/engine/types';
import { food as findFood } from '@/state/catalog';
import { today, useStore } from '@/state/store';
import { Button, Card, Chip, Icon, I, IconButton, Row, Screen, Section, Stepper, Txt, tap } from '@/ui/primitives';
import { MAX_WIDTH, groupColor, space, useTheme } from '@/ui/theme';
import { MicroChip, NutrientTile, fmtPct } from '@/ui/viz';
import { useOpenNutrient } from '@/ui/panels';

const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];
const isSlot = (s: unknown): s is MealSlot => SLOTS.some((x) => x.key === s);

function slotByClock(d = new Date()): MealSlot {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21) return 'dinner';
  return 'snack';
}

const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const GROUPS: { title: string; keys: NutrientKey[] }[] = [
  { title: 'Vitamins', keys: ['vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'folate', 'b12', 'choline'] },
  { title: 'Minerals', keys: ['calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'copper', 'manganese', 'selenium', 'iodine'] },
  { title: 'Fiber', keys: ['fiber'] },
];

/** One line of teaching per food tag. */
const TAG_HINT: Record<FoodTag, string> = {
  fatty_fish: 'Fatty fish. Your omega-3 and vitamin D source: aim for twice a week.',
  leafy_green: 'Leafy green. Vitamin K and folate, for very few calories.',
  whole_grain: 'Whole grain. Fiber, magnesium and manganese stay in.',
  plant_iron: 'Plant iron. Pair it with something rich in vitamin C to absorb more.',
  fermented: 'Fermented. Live cultures for the gut.',
  processed: 'Processed. Check the sodium and saturated fat on this one.',
};

/** "Thiamin (B1)" → "thiamin", "Vitamin C" → "vitamin C" */
const nutrientName = (k: NutrientKey) => {
  const l = NUTRIENTS[k].label.replace(/ \(.+\)/, '');
  return l.charAt(0).toLowerCase() + l.slice(1);
};

const fmtG = (v?: number | null) => (v == null ? '—' : v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

export default function FoodScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const openNutrient = useOpenNutrient();
  const { id, date: dateParam, slot: slotParam, grams: gramsParam, logId } = useLocalSearchParams<{
    id: string;
    date?: string;
    slot?: string;
    grams?: string;
    logId?: string;
  }>();

  const f = findFood(id);
  const profile = useStore((s) => s.profile);
  const log = useStore((s) => (logId ? s.logs.find((l) => l.id === logId) : undefined));
  const isFav = useStore((s) => s.favorites.includes(id));
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const addFood = useStore((s) => s.addFood);
  const updateLog = useStore((s) => s.updateLog);
  const removeLog = useStore((s) => s.removeLog);

  const editing = !!log;
  const date = log?.date ?? dateParam ?? today();
  const startGrams = (() => {
    if (log) return log.grams;
    const g = Number(gramsParam);
    if (Number.isFinite(g) && g > 0) return g;
    return f?.servings?.[0]?.g ?? 100;
  })();
  const [grams, setGrams] = useState(startGrams);
  const [slot, setSlot] = useState<MealSlot>(isSlot(slotParam) ? slotParam : slotByClock());
  const [justAdded, setJustAdded] = useState(false);

  if (!f) {
    return (
      <Screen>
        <Txt v="h2">Food not found</Txt>
        <Button label="Close" style={{ marginTop: space.lg }} onPress={() => router.back()} />
      </Screen>
    );
  }

  const portion = scaled(f, grams);
  const progress = boardProgress(portion, profile);
  const byKey = new Map(progress.map((p) => [p.key, p]));
  const highlights = foodHighlights(f, grams, profile, 4);
  const top = highlights[0];
  const rest = highlights.slice(1);
  const kcal = Math.round(portion.kcal ?? 0);

  const servingChips = [...(f.servings ?? [])];
  if (!servingChips.some((s) => s.g === 100)) servingChips.push({ label: '100 g', g: 100 });
  const step = grams >= 100 ? 10 : 5;

  const gl = f.gi != null ? glycemicLoad(f, grams) : undefined;
  const o3 = omega3(portion);
  const ratio = omegaRatio(portion);
  const hasNoData = progress.some((p) => p.amount == null);

  const cols = 5;
  const inner = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const tileSize = Math.floor((inner - space.sm * (cols - 1)) / cols);

  const topGroup = top ? groupColor(c, top.key === 'fiber' ? 'fiber' : NUTRIENTS[top.key].group) : undefined;
  const tags = (f.tags ?? []).filter((t) => TAG_HINT[t]);
  const changed = editing && Math.abs(grams - startGrams) > 0.001;
  const dateLabel = date === today() ? 'today' : fmtDate(date);

  const add = () => {
    tap('success');
    addFood(date, f.id, grams, slot);
    setJustAdded(true);
    // back to where the day is, not the search list
    if (router.canDismiss()) router.dismissAll();
    else router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen
        bottomInset={150}
        header={
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <Txt v="label" dim={1}>
              {f.category.replace('_', ' / ')}
              {editing ? ' · in your log' : ''}
            </Txt>
            <Row gap={space.sm}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isFav ? 'Remove from favorites' : 'Add to favorites'}
                accessibilityState={{ selected: isFav }}
                hitSlop={8}
                onPress={() => {
                  tap('select');
                  toggleFavorite(f.id);
                }}
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isFav ? c.vitaminSoft : c.surface2,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <Icon name={I.heart} size={16} color={isFav ? c.fat : c.ink3} />
              </Pressable>
              <IconButton icon={I.close} label="Close" onPress={() => router.back()} />
            </Row>
          </Row>
        }>
        <Txt v="title">{f.name}</Txt>
        <Txt v="caption" dim={1} style={{ marginTop: 4 }}>
          {Math.round(grams)} g · {kcal} kcal
        </Txt>

        {/* the headline: this portion, as vitamins */}
        <Card style={{ marginTop: space.lg, gap: space.sm }}>
          <Txt v="label" dim={2}>
            This portion
          </Txt>
          {top && topGroup ? (
            <>
              <Txt v="title" style={{ fontSize: 28, lineHeight: 34 }}>
                Fills <Txt v="title" color={topGroup.fg} style={{ fontSize: 28, lineHeight: 34 }}>{fmtPct(top.pct)}</Txt> of your {nutrientName(top.key)}
              </Txt>
              {top.pct >= 0.8 && (
                <Row gap={6}>
                  <Icon name={I.check} size={14} color={c.accent} />
                  <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
                    Crosses your 80% line on its own
                  </Txt>
                </Row>
              )}
              {rest.length > 0 && (
                <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 2 }}>
                  <Txt v="caption" dim={1}>
                    and
                  </Txt>
                  {rest.map((h) => (
                    <MicroChip key={h.key} k={h.key} pct={h.pct} />
                  ))}
                </Row>
              )}
            </>
          ) : (
            <>
              <Txt v="h2">A light touch on your micros</Txt>
              <Txt v="caption" dim={1}>
                Nothing here reaches 10% of a daily need at this size. Try a bigger portion, or pair it with something colourful.
              </Txt>
            </>
          )}
        </Card>

        {/* amount */}
        <Section title="How much">
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {servingChips.map((s) => (
              <Chip
                key={s.label}
                label={s.label === '100 g' ? '100 g' : `${s.label} · ${s.g} g`}
                active={Math.abs(grams - s.g) < 0.5}
                onPress={() => setGrams(s.g)}
              />
            ))}
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
            <Txt v="caption" dim={1}>
              Fine-tune
            </Txt>
            <Stepper value={grams} step={step} onChange={setGrams} />
          </Row>
        </Section>

        {/* the education moment */}
        <Section title="Your board, with this portion">
          {GROUPS.map((g) => (
            <View key={g.title} style={{ gap: space.sm, marginBottom: space.sm }}>
              <Txt v="caption" dim={2} style={{ fontWeight: '700' }}>
                {g.title}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {g.keys.map((k) => {
                  const p = byKey.get(k);
                  if (!p) return null;
                  return (
                    <NutrientTile
                      key={k}
                      k={k}
                      pct={p.pct}
                      noData={p.amount == null}
                      size={tileSize}
                      onPress={() => openNutrient(k)}
                    />
                  );
                })}
              </View>
            </View>
          ))}
          <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
            Each tile is a share of your daily need. Fill past the dashed line and it counts as done.
            {hasNoData ? ' “No data” means the database doesn’t measure it, not that it’s zero.' : ''}
          </Txt>
        </Section>

        {/* macros */}
        <Section title="Macros">
          <Card style={{ gap: space.lg }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Stat label="kcal" value={String(kcal)} />
              <Stat label="protein g" value={fmtG(portion.protein)} color={c.protein} />
              <Stat label="carbs g" value={fmtG(portion.carbs)} color={c.carbs} />
              <Stat label="fat g" value={fmtG(portion.fat)} color={c.fat} />
            </Row>
            <View style={{ gap: 8, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.line }}>
              <Line label="Fiber" value={`${fmtG(portion.fiber)} g`} />
              <Line label="Saturated fat" value={`${fmtG(portion.satFat)} g`} />
              {f.gi != null && <Line label="Glycemic index" value={`${f.gi}`} note={band(f.gi, 55, 69)} />}
              {gl != null && <Line label="Glycemic load" value={`${fmtG(gl)}`} note={band(gl, 10, 19)} />}
              {o3 != null && o3 > 0 && <Line label="Omega-3" value={`${o3 >= 1 ? fmtG(o3) : Math.round(o3 * 100) / 100} g`} />}
              {ratio != null && o3 != null && o3 > 0.05 && (
                <Line label="Omega-6 : omega-3" value={`${ratio.toFixed(1)} : 1`} note={ratio <= 4 ? 'on target' : undefined} good={ratio <= 4} />
              )}
            </View>
          </Card>
        </Section>

        {tags.length > 0 && (
          <View style={{ marginTop: space.lg, gap: 6 }}>
            {tags.map((t) => (
              <Row key={t} gap={space.sm} style={{ alignItems: 'flex-start' }}>
                <View style={{ marginTop: 3 }}>
                  <Icon name={I.bulb} size={14} color={c.vitamin} />
                </View>
                <Txt v="caption" dim={1} style={{ flex: 1, lineHeight: 18 }}>
                  {TAG_HINT[t]}
                </Txt>
              </Row>
            ))}
          </View>
        )}

        {/* slot */}
        {!editing ? (
          <Section title="Which meal">
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {SLOTS.map((s) => (
                <Chip key={s.key} label={s.label} active={slot === s.key} onPress={() => setSlot(s.key)} />
              ))}
            </Row>
          </Section>
        ) : log?.slot ? (
          <Txt v="caption" dim={2} style={{ marginTop: space.lg }}>
            Logged as {log.slot}
            {log.mealId ? ' · part of a plan meal' : ''}.
          </Txt>
        ) : null}

        {/* citations */}
        <Section title="Sources">
          <View style={{ gap: 4 }}>
            {f.src.length === 0 && (
              <Txt v="caption" dim={2}>
                No source listed.
              </Txt>
            )}
            {f.src.map((s) => (
              <Txt key={`${s.db}${s.ref}`} v="caption" dim={1} selectable>
                {s.db} #{s.ref}
              </Txt>
            ))}
            <Txt v="caption" dim={2} style={{ marginTop: 4, lineHeight: 18 }}>
              Values are per 100 g edible portion, scaled to your amount. Targets are the US/Canadian Dietary Reference Intakes for your age and sex.
            </Txt>
          </View>
        </Section>
      </Screen>

      {/* sticky action bar */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: c.bg,
          borderTopWidth: 1,
          borderTopColor: c.line,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.md,
        }}>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg, gap: space.sm }}>
          {editing ? (
            <Row gap={space.sm}>
              <Button
                kind="secondary"
                label="Remove"
                icon={I.trash}
                style={{ flex: 1 }}
                onPress={() => {
                  tap('light');
                  removeLog(log.id);
                  router.back();
                }}
              />
              <Button
                label="Save changes"
                icon={I.check}
                disabled={!changed}
                style={{ flex: 1.4 }}
                onPress={() => {
                  tap('success');
                  updateLog(log.id, grams);
                  router.back();
                }}
              />
            </Row>
          ) : (
            <Button
              kind={justAdded ? 'done' : 'primary'}
              label={justAdded ? 'Added' : date === today() ? 'Add to today' : `Add to ${dateLabel}`}
              icon={justAdded ? I.check : I.add}
              disabled={justAdded}
              onPress={add}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const band = (v: number, lowMax: number, midMax: number) => (v <= lowMax ? 'low' : v <= midMax ? 'medium' : 'high');

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Txt v="numLg" color={color ?? c.ink}>
        {value}
      </Txt>
      <Txt v="caption" dim={2}>
        {label}
      </Txt>
    </View>
  );
}

function Line({ label, value, note, good }: { label: string; value: string; note?: string; good?: boolean }) {
  const c = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Txt v="caption" dim={1}>
        {label}
      </Txt>
      <Row gap={6}>
        {note && (
          <Txt v="caption" color={good || note === 'low' ? c.accent : note === 'high' ? c.warn : c.ink3} style={{ fontWeight: '700' }}>
            {note}
          </Txt>
        )}
        <Txt v="num">{value}</Txt>
      </Row>
    </Row>
  );
}
