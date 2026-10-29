import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { gapCloser } from '@/engine/calc';
import { COMPLETE_AT, NUTRIENTS } from '@/engine/nutrients';
import { isDisliked } from '@/engine/personalize';
import type { MealSlot, NutrientKey } from '@/engine/types';
import { openTiles, rescueOptions, type RescueMode } from '@/lib/insights';
import { FOODS, food } from '@/state/catalog';
import { useDay, type DayData, type DayMeal } from '@/state/day';
import { useMealLibrary } from '@/state/library';
import { today, useStore } from '@/state/store';
import { EATING_OUT, EATING_OUT_CITATION, type EatingOutMeal } from '@/state/wellnessStore';
import { MacroLine, MealThumb, SLOT_LABEL, dietMatches, openLibraryMeal, useWho } from '@/ui/planParts';
import { Button, Card, Icon, I, IconButton, Row, Screen, Section, Txt, tap, type IconName } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';
import { MicroChip, fmtPct } from '@/ui/viz';

type Step = 'start' | 'meal' | 'which' | 'skip' | 'plan';

const short = (k: NutrientKey) => NUTRIENTS[k].short;

function slotByClock(d = new Date()): MealSlot {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21) return 'dinner';
  return 'snack';
}

/**
 * "Life happened." Tell it what changed (ate out, skipped, something else), then see how to
 * still land an Eighty day. Nothing here scolds: an Eighty day only needs 80%.
 */
export default function Rescue() {
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const date = dateParam ?? today();
  const day = useDay(date);
  const addFood = useStore((s) => s.addFood);
  const removeMealFromDay = useStore((s) => s.removeMealFromDay);

  const [step, setStep] = useState<Step>('start');
  const [picked, setPicked] = useState<EatingOutMeal | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const open = day.meals.filter((m) => !m.eaten);

  const logAteOut = (replaced?: DayMeal) => {
    if (!picked) return;
    tap('success');
    if (replaced) removeMealFromDay(date, replaced.meal.id);
    addFood(date, picked.foodId, picked.grams, replaced?.meal.slot ?? slotByClock());
    setNote(
      `Logged ${picked.name} (about ${picked.kcal} kcal)${replaced ? ` in place of ${replaced.meal.name}` : ''}. Its vitamins and minerals aren’t estimated, so the tiles below show what is still open.`,
    );
    setStep('plan');
  };

  const skip = (m: DayMeal) => {
    tap('success');
    removeMealFromDay(date, m.meal.id);
    setNote(`Took ${m.meal.name} off today. It stays one tap away from Today if you change your mind.`);
    setStep('plan');
  };

  const goBack = () => setStep(step === 'which' ? 'meal' : 'start');

  return (
    <Screen
      bottomInset={40}
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
          {step === 'start' ? <View style={{ width: 34 }} /> : <IconButton icon={I.back} label="Back" onPress={goBack} />}
          <IconButton icon={I.close} label="Close" onPress={() => router.back()} />
        </Row>
      }>
      {step === 'start' && (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: space.sm }}>
            <Txt v="title">Life happens.</Txt>
            <Txt v="body" dim={1} style={{ lineHeight: 22 }}>
              Tell me what changed and I’ll re-plan the rest of today. An Eighty day only needs 80%, so one off meal doesn’t end it.
            </Txt>
          </View>
          <View style={{ gap: space.sm }}>
            <OptionRow icon={I.meals} title="I ate out" sub="Pick what you had. It logs as a typical-portion estimate." onPress={() => setStep('meal')} />
            <OptionRow icon={I.minus} title="I skipped a meal" sub="Take it off today’s plan." onPress={() => setStep('skip')} />
            <OptionRow
              icon={I.search}
              title="I had something else"
              sub="Search and log it yourself."
              onPress={() => {
                setStep('plan');
                router.push({ pathname: '/log', params: { date } });
              }}
            />
          </View>
          <Button kind="ghost" label="Just show me how to finish today" onPress={() => setStep('plan')} />
        </View>
      )}

      {step === 'meal' && (
        <EatOutPicker
          onPick={(m) => {
            setPicked(m);
            setStep('which');
          }}
        />
      )}

      {step === 'which' && picked && (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: space.xs }}>
            <Txt v="title">Which meal was it?</Txt>
            <Txt v="body" dim={1}>
              {picked.name} stands in for a meal on today’s plan, or counts as an extra.
            </Txt>
          </View>
          <View style={{ gap: space.sm }}>
            {open.map((m) => (
              <OptionRow
                key={m.meal.id}
                icon={I.swap}
                title={`Replaced ${m.meal.name}`}
                sub={`${SLOT_LABEL[m.meal.slot]} · ${Math.round(m.totals.kcal ?? 0)} kcal planned`}
                onPress={() => logAteOut(m)}
              />
            ))}
            <OptionRow icon={I.add} title="Extra, on top of the plan" sub="Nothing comes off today." onPress={() => logAteOut()} />
          </View>
        </View>
      )}

      {step === 'skip' && (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: space.xs }}>
            <Txt v="title">Which meal?</Txt>
            <Txt v="body" dim={1}>
              No worries. I’ll take it off today and look at what’s left.
            </Txt>
          </View>
          {open.length > 0 ? (
            <View style={{ gap: space.sm }}>
              {open.map((m) => (
                <OptionRow
                  key={m.meal.id}
                  icon={I.minus}
                  title={m.meal.name}
                  sub={`${SLOT_LABEL[m.meal.slot]} · ${Math.round(m.totals.kcal ?? 0)} kcal`}
                  onPress={() => skip(m)}
                />
              ))}
            </View>
          ) : (
            <Card>
              <Txt v="bodyStrong">Nothing left to skip today.</Txt>
              <Txt v="caption" dim={1} style={{ marginTop: 4 }}>
                Every meal on the plan is already eaten or taken off.
              </Txt>
              <Button label="Show me the rest of today" style={{ marginTop: space.md }} onPress={() => setStep('plan')} />
            </Card>
          )}
        </View>
      )}

      {step === 'plan' && <RescuePlan day={day} date={date} note={note} />}
    </Screen>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function OptionRow({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={() => {
        tap('select');
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line,
        opacity: pressed ? 0.8 : 1,
      })}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={c.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="h3">{title}</Txt>
        <Txt v="caption" dim={1}>
          {sub}
        </Txt>
      </View>
      <Icon name={I.chevron} size={15} color={c.ink3} />
    </Pressable>
  );
}

function EatOutPicker({ onPick }: { onPick: (m: EatingOutMeal) => void }) {
  const c = useTheme();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return EATING_OUT.filter((m) => tokens.every((t) => `${m.name} ${m.portion}`.toLowerCase().includes(t)));
  }, [query]);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Txt v="title">What did you have?</Txt>
        <Txt v="body" dim={1}>
          Pick the closest match.
        </Txt>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          height: 48,
          paddingHorizontal: space.md,
          borderRadius: radius.pill,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.line,
        }}>
        <Icon name={I.search} size={17} color={c.ink3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search: pizza, pho, burrito…"
          placeholderTextColor={c.ink3}
          accessibilityLabel="Search restaurant meals"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, height: 48, color: c.ink, fontSize: 16, outlineStyle: 'none' } as never}
        />
      </View>
      <View style={{ gap: space.sm }}>
        {shown.map((m) => (
          <Pressable
            key={m.foodId}
            accessibilityRole="button"
            accessibilityLabel={`${m.name}, ${m.portion}, about ${m.kcal} kilocalories`}
            onPress={() => {
              tap('select');
              onPick(m);
            }}
            style={({ pressed }) => ({
              padding: space.md,
              paddingHorizontal: space.lg,
              borderRadius: radius.lg,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.line,
              gap: 2,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Txt v="bodyStrong">{m.name}</Txt>
            <Txt v="caption" dim={2}>
              {m.portion}
            </Txt>
            <MacroLine totals={{ kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat }} />
          </Pressable>
        ))}
        {shown.length === 0 && (
          <Txt v="caption" dim={1} style={{ paddingVertical: space.lg, textAlign: 'center' }}>
            Nothing close. Go back and choose “I had something else” to search every food.
          </Txt>
        )}
      </View>
      <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
        {EATING_OUT_CITATION}
      </Txt>
    </View>
  );
}

interface Applied {
  name: string;
  mode: RescueMode;
  uid: string;
  replaced?: string;
}

/** Rescue the rest of today: what's still open, and the smallest ways to close it. */
function RescuePlan({ day, date, note }: { day: DayData; date: string; note: string | null }) {
  const c = useTheme();
  const library = useMealLibrary();
  const who = useWho(day.profile);
  const addMealToDay = useStore((s) => s.addMealToDay);
  const removeMealFromDay = useStore((s) => s.removeMealFromDay);
  const restorePlanMeal = useStore((s) => s.restorePlanMeal);
  const addFood = useStore((s) => s.addFood);
  const [applied, setApplied] = useState<Applied | null>(null);

  const { diet, dislikes } = day.profile;
  const open = useMemo(() => openTiles(day.projected, who), [day.projected, who]);
  const openProgress = day.projectedProgress.filter((p) => open.includes(p.key)).sort((a, b) => a.pct - b.pct);

  // target − eaten − the plan meals still to come (projected already holds all of it)
  const headroom = Math.round(day.macros.kcal - (day.projected.kcal ?? 0));
  const dinner = day.meals.find((m) => m.source === 'plan' && m.meal.slot === 'dinner' && !m.eaten);

  const candidates = useMemo(
    () =>
      library
        .filter(
          (lm) =>
            lm.meal.slot !== 'breakfast' &&
            (lm.totals.kcal ?? 0) > 0 &&
            dietMatches(lm, diet) &&
            !lm.meal.ingredients.some((i) => isDisliked(food(i.foodId), dislikes)) &&
            !day.meals.some((m) => m.key === lm.key),
        )
        .map((lm) => ({ key: lm.key, kcal: Math.round(lm.totals.kcal ?? 0), totals: lm.totals, canSwap: lm.meal.slot === 'lunch' || lm.meal.slot === 'dinner' })),
    [library, diet, dislikes, day.meals],
  );
  const byKey = useMemo(() => new Map(library.map((lm) => [lm.key, lm])), [library]);

  const options = useMemo(
    () =>
      rescueOptions({
        projected: day.projected,
        who,
        candidates,
        headroomKcal: headroom,
        swapOut: dinner ? { totals: dinner.totals, kcal: Math.round(dinner.totals.kcal ?? 0) } : undefined,
        limit: 3,
      }),
    [day.projected, who, candidates, headroom, dinner],
  );

  const foods = useMemo(
    () =>
      gapCloser(day.projectedProgress, FOODS, {
        limit: 3,
        exclude: (f) =>
          isDisliked(f, dislikes) ||
          (diet.includes('vegetarian') && ['meat', 'poultry', 'fish'].includes(f.category)) ||
          (diet.includes('vegan') && ['meat', 'poultry', 'fish', 'dairy', 'egg'].includes(f.category)) ||
          (diet.includes('pescatarian') && ['meat', 'poultry'].includes(f.category)),
      }),
    [day.projectedProgress, diet, dislikes],
  );

  const apply = (key: string, mode: RescueMode) => {
    const lm = byKey.get(key);
    if (!lm) return;
    tap('success');
    if (mode === 'swap' && dinner) {
      const uid = addMealToDay(date, lm.key, lm.meal, { slot: dinner.meal.slot, replaces: dinner.meal.id });
      setApplied({ name: lm.meal.name, mode, uid, replaced: dinner.meal.id });
    } else {
      const uid = addMealToDay(date, lm.key, lm.meal, { slot: 'snack' });
      setApplied({ name: lm.meal.name, mode: 'add', uid });
    }
  };

  const undo = () => {
    if (!applied) return;
    if (applied.replaced) restorePlanMeal(date, applied.replaced);
    else removeMealFromDay(date, applied.uid);
    setApplied(null);
  };

  const { done, of } = day.projectedScore;
  const needed = Math.max(0, Math.ceil(COMPLETE_AT * of - 1e-9) - done);

  return (
    <View>
      <Txt v="title">Rescue the rest of today</Txt>
      <Txt v="body" dim={1} style={{ marginTop: space.xs, lineHeight: 22 }}>
        Life happens. Here’s how to still land an Eighty day.
      </Txt>

      {note && (
        <View style={{ marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface2 }}>
          <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
            {note}
          </Txt>
        </View>
      )}

      {applied && (
        <Card tone="accentSoft" style={{ marginTop: space.md }}>
          <Row gap={space.sm}>
            <Icon name={I.check} size={16} color={c.accent} />
            <Txt v="bodyStrong" color={c.accent} style={{ flex: 1 }} accessibilityLiveRegion="polite">
              {applied.mode === 'swap' ? `Swapped ${applied.name} into dinner` : `Added ${applied.name} as a snack`}
            </Txt>
          </Row>
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <Button small kind="secondary" icon={I.undo} label="Undo" onPress={undo} />
            <Button small label="Back to Today" onPress={() => router.back()} />
          </Row>
        </Card>
      )}

      <Card style={{ marginTop: space.lg }}>
        <Txt v="label" dim={1}>
          After your remaining meals
        </Txt>
        {of === 0 ? (
          <Txt v="body" style={{ marginTop: space.xs }}>
            Nothing logged or planned yet, so every tile is open.
          </Txt>
        ) : (
          <Txt v="h2" style={{ marginTop: 2 }}>
            {done} of {of} tiles at 80%
          </Txt>
        )}
        <Txt v="caption" dim={1} style={{ marginTop: 2, lineHeight: 18 }}>
          {of > 0 && needed === 0
            ? 'That’s an Eighty day. Nothing to fix.'
            : of > 0
              ? `${needed} more tile${needed === 1 ? '' : 's'} makes it an Eighty day.`
              : 'Add a meal and the board starts filling.'}
          {headroom > 0 ? ` About ${headroom.toLocaleString()} kcal of room left.` : ' Your calories are already spoken for, so swaps work better than additions.'}
        </Txt>
        {openProgress.length > 0 && (
          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.md }}>
            {openProgress.slice(0, 10).map((p) => (
              <MicroChip key={p.key} k={p.key} pct={p.pct} />
            ))}
            {openProgress.length > 10 && (
              <Txt v="caption" dim={2}>
                +{openProgress.length - 10} more
              </Txt>
            )}
          </Row>
        )}
      </Card>

      {open.length === 0 ? (
        <Card tone="accentSoft" style={{ marginTop: space.md }}>
          <Row gap={space.sm}>
            <Icon name={I.spark} color={c.accent} />
            <Txt v="bodyStrong" color={c.accent} style={{ flex: 1 }}>
              The rest of today’s plan still fills every tile it can. You’re fine.
            </Txt>
          </Row>
        </Card>
      ) : (
        <>
          <Section title="Meals that close the gaps">
            {options.length === 0 ? (
              <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
                No whole meal fits the calories you have left. A small food can still close a gap.
              </Txt>
            ) : (
              options.map((o) => {
                const lm = byKey.get(o.key);
                if (!lm) return null;
                return (
                  <Card key={o.key} style={{ gap: space.md }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${lm.meal.name}. Open the meal`}
                      onPress={() => openLibraryMeal(lm.key)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
                      <Row gap={space.md}>
                        <MealThumb meal={lm.meal} size={52} />
                        <View style={{ flex: 1 }}>
                          <Txt v="h3" numberOfLines={2}>
                            {lm.meal.name}
                          </Txt>
                          <Txt v="caption" dim={2}>
                            {o.kcal} kcal · {Math.round(lm.totals.protein ?? 0)} g protein
                          </Txt>
                        </View>
                      </Row>
                    </Pressable>
                    {o.plays.map((p) => (
                      <Row key={p.mode} gap={space.md}>
                        <Button
                          small
                          kind={p.mode === 'swap' ? 'primary' : 'secondary'}
                          icon={p.mode === 'swap' ? I.swap : I.add}
                          label={p.mode === 'swap' ? 'Swap into dinner' : 'Add as snack'}
                          onPress={() => apply(o.key, p.mode)}
                        />
                        <Txt v="caption" dim={1} style={{ flex: 1, lineHeight: 17 }}>
                          Finishes {p.closes.map(short).join(', ')}
                        </Txt>
                      </Row>
                    ))}
                  </Card>
                );
              })
            )}
            {dinner && options.length > 0 && (
              <Txt v="caption" dim={2}>
                Swapping replaces tonight’s {dinner.meal.name}, and is only offered when nothing it covers drops below 80%.
              </Txt>
            )}
          </Section>

          {foods.length > 0 && (
            <Section title="Or one small food">
              <Card>
                <View style={{ gap: space.sm }}>
                  {foods.map((s) => {
                    const p = openProgress.find((x) => x.key === s.nutrient);
                    return (
                      <Row key={s.nutrient} gap={space.md} style={{ paddingVertical: 4 }}>
                        <View style={{ width: 52 }}>
                          <Txt v="bodyStrong">{short(s.nutrient)}</Txt>
                          {p && (
                            <Txt v="caption" dim={2} style={{ fontVariant: ['tabular-nums'] }}>
                              {fmtPct(p.pct)}
                            </Txt>
                          )}
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${s.grams} grams ${s.food.name}. Choose an amount`}
                          style={{ flex: 1 }}
                          onPress={() => router.push({ pathname: '/food/[id]', params: { id: s.food.id, grams: String(s.grams), date } })}>
                          <Txt v="bodyStrong" numberOfLines={1}>
                            {s.grams} g {s.food.name.split(',')[0].toLowerCase()}
                          </Txt>
                          <Txt v="caption" dim={2} numberOfLines={1}>
                            {Math.round(s.kcal)} kcal
                            {s.alsoHelps.length ? ` · also helps ${s.alsoHelps.map(short).join(', ')}` : ''}
                          </Txt>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${s.grams} grams ${s.food.name}`}
                          onPress={() => {
                            tap('success');
                            addFood(date, s.food.id, s.grams, 'snack');
                          }}
                          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={I.add} size={16} color={c.bg} />
                        </Pressable>
                      </Row>
                    );
                  })}
                </View>
              </Card>
            </Section>
          )}
        </>
      )}

      <Button kind="ghost" label="Back to Today" style={{ marginTop: space.xl }} onPress={() => router.back()} />
    </View>
  );
}
