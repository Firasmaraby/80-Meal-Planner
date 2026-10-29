import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { tipFor } from '@/content/tips';
import { bandLabel } from '@/engine/calc';
import { NUTRIENTS } from '@/engine/nutrients';
import { food } from '@/state/catalog';
import { useDay, useHistory, type DayData } from '@/state/day';
import { addDays, daysBetween, today, useStore } from '@/state/store';
import { CheckinPromptCard } from '@/ui/checkin';
import { MealCard } from '@/ui/MealCard';
import { RescueEntry } from '@/ui/rescue';
import { BoardPreviewCard, GapCloserCard, PillarStrip, TipCard } from '@/ui/panels';
import { Button, Card, Icon, I, IconButton, Row, Screen, Section, Txt } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';
import { MacroBar, Ring } from '@/ui/viz';

const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

export default function Today() {
  const c = useTheme();
  const [date, setDate] = useState(today());
  const day = useDay(date);
  const history = useHistory(7, date);
  const enrollment = useStore((s) => s.enrollment);
  const removeLog = useStore((s) => s.removeLog);
  const restorePlanMeal = useStore((s) => s.restorePlanMeal);
  const isToday = date === today();

  const dayNum = day.planDay?.day;
  const kcal = day.eaten.kcal ?? 0;
  const kcalProjected = day.projected.kcal ?? 0;

  return (
    <Screen
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
          <View style={{ flex: 1 }}>
            <Row gap={6}>
              <IconButton icon={I.back} label="Previous day" onPress={() => setDate(addDays(date, -1))} />
              <Pressable onPress={() => setDate(today())}>
                <Txt v="label" dim={1}>
                  {isToday ? 'Today' : fmtDate(date)}
                </Txt>
              </Pressable>
              {!isToday && <IconButton icon={I.chevron} label="Next day" onPress={() => setDate(addDays(date, 1))} />}
            </Row>
            <Txt v="title" style={{ marginTop: space.sm }}>
              {isToday ? fmtDate(date) : day.plan ? `Day ${dayNum ?? '—'}` : 'Your log'}
            </Txt>
          </View>
          <IconButton icon={I.add} tone="filled" label="Log food" onPress={() => router.push({ pathname: '/log', params: { date } })} />
        </Row>
      }>
      {/* Hero: how much of the board is done, and where today's plan takes you */}
      <Card style={{ padding: space.xl }}>
        <Row gap={space.xl} style={{ alignItems: 'center' }}>
          <Ring value={day.score.ratio} ghost={day.projectedScore.ratio} size={128} stroke={13}>
            <Txt v="numLg">
              {day.score.done}
              <Txt v="h3" dim={2}>
                /{day.score.of || day.projectedScore.of || 25}
              </Txt>
            </Txt>
            <Txt v="caption" dim={2} style={{ fontSize: 11, fontWeight: '700' }}>
              AT 80%
            </Txt>
          </Ring>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt v="h2">{day.score.eightyDay ? 'Eighty day ✓' : day.score.done === 0 ? 'Fresh board' : 'Filling up'}</Txt>
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              {day.plan
                ? `Finish today’s plan and ${day.projectedScore.done} of ${day.projectedScore.of} nutrients cross 80%.`
                : 'Log what you eat and watch your vitamins and minerals fill in.'}
            </Txt>
            <Pressable onPress={() => router.push('/board')}>
              <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
                Open board →
              </Txt>
            </Pressable>
          </View>
        </Row>
        <View style={{ height: 1, backgroundColor: c.line, marginVertical: space.lg }} />
        <View style={{ gap: space.md }}>
          <MacroBar label="Calories" eaten={kcal} planned={Math.max(0, kcalProjected - kcal)} target={day.macros.kcal} unit="kcal" color={c.ink} />
          <MacroBar label="Protein" eaten={day.eaten.protein ?? 0} planned={Math.max(0, (day.projected.protein ?? 0) - (day.eaten.protein ?? 0))} target={day.macros.protein} unit="g" color={c.protein} />
          <Row gap={space.lg}>
            <View style={{ flex: 1 }}>
              <MacroBar label="Carbs" eaten={day.eaten.carbs ?? 0} planned={Math.max(0, (day.projected.carbs ?? 0) - (day.eaten.carbs ?? 0))} target={day.macros.carbs} unit="g" color={c.carbs} compact />
            </View>
            <View style={{ flex: 1 }}>
              <MacroBar label="Fat" eaten={day.eaten.fat ?? 0} planned={Math.max(0, (day.projected.fat ?? 0) - (day.eaten.fat ?? 0))} target={day.macros.fat} unit="g" color={c.fat} compact />
            </View>
          </Row>
        </View>
      </Card>

      <View style={{ marginTop: space.md }}>
        <BoardPreviewCard day={day} />
      </View>
      <View style={{ marginTop: space.md }}>
        <CheckinPromptCard />
      </View>

      {day.plan || day.meals.length > 0 ? (
        <Section
          title={day.plan ? `${day.plan.name} · Day ${dayNum ?? '–'} of ${day.plan.days.length}` : 'Your meals'}
          action={
            day.plan ? (
              <Pressable onPress={() => router.push({ pathname: '/plan/[id]', params: { id: day.plan!.id } })}>
                <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
                  {day.sizing?.on ? `Sized to ${day.sizing.kcal.toLocaleString()} kcal` : `${bandLabel(day.plan.band)} kcal`}
                </Txt>
              </Pressable>
            ) : undefined
          }>
          {day.sizing && <SizingNote sizing={day.sizing} />}
          <View>
            {day.meals.map((m) => (
              <MealCard key={m.meal.id} m={m} date={date} planId={day.plan?.id} profile={day.profile} />
            ))}
          </View>
          {day.skipped.map((m) => (
            <Row key={m.id} style={{ justifyContent: 'space-between', paddingVertical: 6, paddingLeft: 34 }}>
              <Txt v="caption" dim={2} style={{ flex: 1 }} numberOfLines={1}>
                Removed: {m.name}
              </Txt>
              <Pressable accessibilityRole="button" accessibilityLabel={`Put ${m.name} back`} onPress={() => restorePlanMeal(date, m.id)}>
                <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
                  Put back
                </Txt>
              </Pressable>
            </Row>
          ))}
          <Button kind="secondary" icon={I.meals} label="Add a meal from the library" style={{ marginTop: space.sm }} onPress={() => router.push('/meals')} />
          <View style={{ marginTop: space.sm }}>
            <RescueEntry date={date} />
          </View>
        </Section>
      ) : (
        <Section title="Meal plan">
          <Card>
            <Txt v="h3">Pick a plan to follow</Txt>
            <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
              Every plan is built to cover your vitamins and minerals in your calorie band. Follow it and your board fills itself.
            </Txt>
            <Button label="Browse plans" icon={I.plans} style={{ marginTop: space.md }} onPress={() => router.push('/plans')} />
            <Button kind="ghost" label="Or pick single meals" icon={I.meals} style={{ marginTop: space.xs }} onPress={() => router.push('/meals')} />
          </Card>
        </Section>
      )}

      {enrollment && daysBetween(enrollment.startedOn, date) < 0 && (
        <Txt v="caption" dim={2}>
          Your plan starts on {fmtDate(enrollment.startedOn)}.
        </Txt>
      )}

      <Section
        title="Also eaten"
        action={
          <Pressable onPress={() => router.push({ pathname: '/log', params: { date } })}>
            <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
              + Add food
            </Txt>
          </Pressable>
        }>
        {day.extras.length === 0 ? (
          <Txt v="caption" dim={2}>
            Snacks and anything off-plan show up here.
          </Txt>
        ) : (
          <Card style={{ paddingVertical: space.sm }}>
            {day.extras.map((l, i) => {
              const f = food(l.foodId);
              return (
                <Row key={l.id} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                  <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/food/[id]', params: { id: l.foodId, logId: l.id, date } })}>
                    <Txt v="bodyStrong" numberOfLines={1}>
                      {f?.name ?? l.foodId}
                    </Txt>
                    <Txt v="caption" dim={2}>
                      {Math.round(l.grams)} g · {Math.round(((f?.n.kcal ?? 0) * l.grams) / 100)} kcal
                    </Txt>
                  </Pressable>
                  <IconButton icon={I.trash} label="Remove" onPress={() => removeLog(l.id)} />
                </Row>
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="Gap closer">
        <GapCloserCard day={day} basis={day.plan ? 'projected' : 'eaten'} />
      </Section>

      <Section title="Framework pillars">
        <PillarStrip day={day} fishThisWeek={history.fishThisWeek} />
      </Section>

      <View style={{ marginTop: space.xl }}>
        <TipCard tip={tipFor(day)} />
      </View>

      {day.progress.some((p) => p.overUL) && (
        <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.danger }}>
          <Row>
            <Icon name={I.info} size={16} color={c.danger} />
            <Txt v="caption" color={c.danger} style={{ flex: 1, fontWeight: '600' }}>
              Above the upper limit today: {day.progress.filter((p) => p.overUL).map((p) => NUTRIENTS[p.key].label).join(', ')}. More isn’t better here.
            </Txt>
          </Row>
        </View>
      )}
    </Screen>
  );
}

/**
 * Explains how the plan was made theirs: portions sized to their calories (micros first),
 * swaps for foods they don't eat, and when a different band would serve them better.
 */
function SizingNote({ sizing }: { sizing: NonNullable<DayData['sizing']> }) {
  const c = useTheme();
  const swapped = sizing.swaps.map((s) => `${food(s.from)?.name.split(',')[0] ?? s.from} → ${food(s.to)?.name.split(',')[0] ?? s.to}`);
  const lines: { text: string; tone: string }[] = [];
  if (sizing.on && !sizing.advice.ok)
    lines.push({
      tone: c.warn,
      text:
        sizing.advice.suggest === 'lower'
          ? `Your target is ${sizing.target.toLocaleString()} kcal. This plan stops at ${sizing.kcal.toLocaleString()} so no nutrient drops below 80%. A lower-calorie plan will fit you better.`
          : `Your target is ${sizing.target.toLocaleString()} kcal. This plan tops out at ${sizing.kcal.toLocaleString()}. A higher-calorie plan will fit you better.`,
    });
  if (swapped.length) lines.push({ tone: c.ink2, text: `Swapped for you: ${swapped.join(', ')}.` });
  if (sizing.unresolved.length)
    lines.push({ tone: c.ink2, text: `No close swap for ${sizing.unresolved.map((id) => food(id)?.name.split(',')[0] ?? id).join(', ')}; open the meal to replace it.` });
  if (!lines.length) return null;
  return (
    <View style={{ gap: 6, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface2, marginBottom: space.md }}>
      {lines.map((l) => (
        <Txt key={l.text} v="caption" color={l.tone} style={{ lineHeight: 18 }}>
          {l.text}
        </Txt>
      ))}
      {sizing.on && !sizing.advice.ok && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/plans')}>
          <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
            See plans that fit →
          </Txt>
        </Pressable>
      )}
    </View>
  );
}
