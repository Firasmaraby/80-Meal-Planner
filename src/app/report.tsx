import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { logsTotal } from '@/engine/calc';
import { requirement } from '@/engine/dri';
import { NUTRIENTS } from '@/engine/nutrients';
import {
  FEEL_KEYS,
  bestAndWorst,
  eightyStats,
  feelLine,
  feelSplit,
  isEightyDay,
  kgToLb,
  nutrientHitRates,
  settleToday,
  topFoodSources,
  weightSeries,
  type DayTotals,
  type FeelKey,
  type HitRate,
} from '@/lib/insights';
import { FOODS, FOOD_INDEX } from '@/state/catalog';
import { useMealLibrary } from '@/state/library';
import { addDays, today, useStore, type Log } from '@/state/store';
import { foldInSupplements, supplementTotal, useWellness } from '@/state/wellnessStore';
import { MealThumb, openLibraryMeal, useWho } from '@/ui/planParts';
import { Button, Card, I, IconButton, Row, Screen, Section, Txt } from '@/ui/primitives';
import { groupColor, radius, space, useTheme } from '@/ui/theme';
import { fmtPct } from '@/ui/viz';

const WINDOW = 30;
const NEEDED_FOR_PATTERNS = 3;
const MIN_EACH = 4;

function dayTotalsFor(byDate: Map<string, Log[]>, takenOn: Record<string, string[]>, date: string): DayTotals {
  const l = byDate.get(date) ?? [];
  return { date, logged: l.length > 0, totals: foldInSupplements(logsTotal(l, FOOD_INDEX), supplementTotal(takenOn[date])) };
}

const fmtShort = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** The last 30 days at a glance: how often you landed an Eighty day, which tiles are easy, which are hard. */
export default function Report() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const logs = useStore((s) => s.logs);
  const takenOn = useWellness((s) => s.takenOn);
  const checkins = useWellness((s) => s.checkins);
  const unit = useWellness((s) => s.weightUnit);
  const library = useMealLibrary();
  const who = useWho(profile);
  const end = today();

  const byDate = useMemo(() => {
    const m = new Map<string, Log[]>();
    for (const l of logs) m.set(l.date, [...(m.get(l.date) ?? []), l]);
    return m;
  }, [logs]);

  // food plus any supplements taken, the same way the board counts them
  const days = useMemo(
    () => Array.from({ length: WINDOW }, (_, i) => dayTotalsFor(byDate, takenOn, addDays(end, -(WINDOW - 1 - i)))),
    [byDate, takenOn, end],
  );
  const settled = useMemo(() => settleToday(days, end, who), [days, end, who]);
  const stats = useMemo(() => eightyStats(settled, who), [settled, who]);
  const rates = useMemo(() => nutrientHitRates(settled, who), [settled, who]);
  const { best, worst } = useMemo(() => bestAndWorst(rates, 5), [rates]);
  const enough = stats.loggedDays >= NEEDED_FOR_PATTERNS;

  // how you felt: every check-in, judged by the day it was made on
  const feelFlags = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const ck of checkins) {
      const d = dayTotalsFor(byDate, takenOn, ck.date);
      if (d.logged) m.set(ck.date, isEightyDay(d, who));
    }
    return m;
  }, [checkins, byDate, takenOn, who]);
  const split = useMemo(() => feelSplit(checkins, feelFlags, MIN_EACH), [checkins, feelFlags]);
  const eightyCheckins = checkins.filter((ck) => feelFlags.get(ck.date) === true).length;
  const otherCheckins = checkins.filter((ck) => feelFlags.get(ck.date) === false).length;

  const weights = useMemo(() => weightSeries(checkins, addDays(end, -(WINDOW - 1))), [checkins, end]);

  const toughest = worst[0] ?? (best.length ? best[best.length - 1] : undefined);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen
      bottomInset={40}
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <IconButton icon={I.back} label="Back" onPress={back} />
        </Row>
      }>
      <Txt v="label" dim={1}>
        Report card · last {WINDOW} days
      </Txt>
      <Txt v="title" style={{ marginTop: 2 }}>
        How it’s going
      </Txt>

      {/* Eighty days + streak */}
      <Card style={{ marginTop: space.lg, gap: space.lg }}>
        <Row gap={space.xl}>
          <View style={{ flex: 1 }}>
            <Txt v="numLg" color={stats.eightyDays > 0 ? c.accent : c.ink}>
              {stats.eightyDays}
            </Txt>
            <Txt v="caption" dim={1}>
              Eighty day{stats.eightyDays === 1 ? '' : 's'}
              {stats.loggedDays > 0 ? ` of ${stats.loggedDays} logged` : ''}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="numLg">{stats.streak}</Txt>
            <Txt v="caption" dim={1}>
              day streak
            </Txt>
          </View>
        </Row>
        <DayStrip days={days} eighty={stats.byDate} today={end} />
        <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
          {stats.loggedDays === 0
            ? 'Log a day and it shows up here.'
            : 'Only days you logged count, so a quiet week never counts against you. Eighty days are the dark squares.'}
        </Txt>
      </Card>

      {!enough ? (
        <Card style={{ marginTop: space.md }}>
          <Txt v="h3">Patterns need a few more days</Txt>
          <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
            Once you’ve logged {NEEDED_FOR_PATTERNS} days you’ll see which nutrients you hit most often and which need attention. Tuesday-proof: it doesn’t need to be every day.
          </Txt>
          <Button label="Log food" icon={I.add} style={{ marginTop: space.md }} onPress={() => router.push('/log')} />
        </Card>
      ) : (
        <>
          <Section title="Most often at 80%">
            <HitList rates={best} />
          </Section>
          {worst.length > 0 && (
            <Section title="Least often at 80%">
              <HitList rates={worst} />
            </Section>
          )}

          {toughest && toughest.rate < 1 && <Toughest rate={toughest} library={library} />}
          {toughest && toughest.rate >= 1 && (
            <Card tone="accentSoft" style={{ marginTop: space.xl }}>
              <Txt v="bodyStrong" color={c.accent}>
                Every tile reached 80% on every day you logged. Nothing to chase.
              </Txt>
            </Card>
          )}
        </>
      )}

      {/* How you felt */}
      <Section
        title="How you felt"
        action={
          <Button small kind="secondary" label="Check in" icon={I.check} onPress={() => router.push('/checkin')} />
        }>
        {split ? (
          <Card style={{ gap: space.md }}>
            {FEEL_KEYS.map((k) => (
              <FeelRow key={k} what={k} text={feelLine(k, split)} a={split.eighty.avg[k]} b={split.other.avg[k]} />
            ))}
            <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
              From {split.eighty.n} check-ins on Eighty days and {split.other.n} on other days you logged. These are your own ratings next to what you ate: a pattern worth noticing, not proof that one causes the other.
            </Txt>
          </Card>
        ) : (
          <Card>
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              Once you have {MIN_EACH} check-ins on Eighty days and {MIN_EACH} on other days, you’ll see how your energy, sleep and mood compare. So far: {eightyCheckins} on Eighty days, {otherCheckins} on other days.
            </Txt>
          </Card>
        )}
      </Section>

      {/* Weight */}
      {weights.length > 0 && (
        <Section title="Weight trend">
          <WeightCard points={weights} unit={unit} />
        </Section>
      )}
    </Screen>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

/** 30 small squares, oldest first: dark = Eighty day, tinted = logged, empty = not logged. */
function DayStrip({ days, eighty, today: now }: { days: DayTotals[]; eighty: Map<string, boolean>; today: string }) {
  const c = useTheme();
  const count = days.filter((d) => eighty.get(d.date)).length;
  return (
    <View
      accessible
      accessibilityLabel={`${count} Eighty days in the last ${days.length} days`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {days.map((d) => {
        const is80 = eighty.get(d.date) === true;
        return (
          <View
            key={d.date}
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              backgroundColor: is80 ? c.accent : d.logged ? c.accentSoft : c.surface2,
              borderWidth: d.date === now ? 1.5 : 0,
              borderColor: c.ink,
            }}
          />
        );
      })}
    </View>
  );
}

function HitList({ rates }: { rates: HitRate[] }) {
  return (
    <Card style={{ gap: space.md }}>
      {rates.map((r) => (
        <HitRow key={r.key} r={r} />
      ))}
    </Card>
  );
}

function HitRow({ r }: { r: HitRate }) {
  const c = useTheme();
  const info = NUTRIENTS[r.key];
  const g = groupColor(c, r.key === 'fiber' ? 'fiber' : info.group);
  return (
    <View
      accessible
      accessibilityLabel={`${info.label}: reached 80% on ${r.hit} of ${r.of} days, ${fmtPct(r.rate)}`}
      style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="bodyStrong">{info.label}</Txt>
        <Txt v="caption" dim={1} style={{ fontVariant: ['tabular-nums'] }}>
          <Txt v="caption" style={{ fontWeight: '800' }}>
            {fmtPct(r.rate)}
          </Txt>
          {`  ${r.hit}/${r.of} days`}
        </Txt>
      </Row>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.surface2, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(r.rate * 100, r.rate > 0 ? 3 : 0)}%`, height: 6, borderRadius: radius.pill, backgroundColor: g.fg }} />
      </View>
    </View>
  );
}

/** The hardest tile this month, and where to get it. */
function Toughest({ rate, library }: { rate: HitRate; library: ReturnType<typeof useMealLibrary> }) {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const info = NUTRIENTS[rate.key];
  const req = useMemo(() => requirement(rate.key, profile), [rate.key, profile]);

  const foods = useMemo(() => (req ? topFoodSources(rate.key, FOODS, req.rda, 4) : []), [rate.key, req]);
  const meals = useMemo(
    () =>
      req
        ? library
            .filter((lm) => (lm.totals[rate.key] ?? 0) > 0)
            .map((lm) => ({ lm, pct: (lm.totals[rate.key] ?? 0) / req.rda }))
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 2)
        : [],
    [library, rate.key, req],
  );

  return (
    <Section title="Worth a little attention">
      <Card style={{ gap: space.md }}>
        <View>
          <Txt v="h3">{info.label}</Txt>
          <Txt v="caption" dim={1} style={{ marginTop: 2, lineHeight: 18 }}>
            Reached 80% on {rate.hit} of {rate.of} logged days. {info.why}
          </Txt>
        </View>
        {foods.length > 0 && (
          <View style={{ gap: 6 }}>
            <Txt v="label" dim={2}>
              Top food sources
            </Txt>
            {foods.map((s) => (
              <Row key={s.food.id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Txt v="body" numberOfLines={1}>
                    {s.food.name}
                  </Txt>
                  <Txt v="caption" dim={2}>
                    {s.label} ({Math.round(s.grams)} g)
                  </Txt>
                </View>
                <Txt v="num" color={s.pct >= 0.8 ? c.accent : c.ink}>
                  {fmtPct(s.pct)}
                </Txt>
              </Row>
            ))}
          </View>
        )}
        {meals.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Txt v="label" dim={2}>
              Meals rich in it
            </Txt>
            {meals.map(({ lm, pct }) => (
              <Pressable
                key={lm.key}
                accessibilityRole="button"
                accessibilityLabel={`${lm.meal.name}, ${fmtPct(pct)} of your daily ${info.label}. Open the meal`}
                onPress={() => openLibraryMeal(lm.key)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.75 : 1 })}>
                <MealThumb meal={lm.meal} size={40} />
                <Txt v="body" numberOfLines={2} style={{ flex: 1 }}>
                  {lm.meal.name}
                </Txt>
                <Txt v="num">{fmtPct(pct)}</Txt>
              </Pressable>
            ))}
          </View>
        )}
        <Button kind="secondary" label={`Find meals rich in ${info.label}`} icon={I.meals} onPress={() => router.push('/meals')} />
      </Card>
    </Section>
  );
}

function FeelRow({ what, text, a, b }: { what: FeelKey; text: string; a: number; b: number }) {
  const c = useTheme();
  return (
    <View accessible accessibilityLabel={text} style={{ gap: 6 }}>
      <Txt v="body">{text}</Txt>
      <View style={{ gap: 4 }}>
        <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.surface2, overflow: 'hidden' }}>
          <View style={{ width: `${(a / 5) * 100}%`, height: 6, backgroundColor: c.accent }} />
        </View>
        <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.surface2, overflow: 'hidden' }}>
          <View style={{ width: `${(b / 5) * 100}%`, height: 6, backgroundColor: c.ink3 }} />
        </View>
      </View>
      <Txt v="caption" dim={2}>
        Out of 5 · {what}
      </Txt>
    </View>
  );
}

function WeightCard({ points, unit }: { points: { date: string; kg: number }[]; unit: 'kg' | 'lb' }) {
  const conv = (kg: number) => (unit === 'kg' ? kg : kgToLb(kg));
  const first = conv(points[0].kg);
  const last = conv(points[points.length - 1].kg);
  const delta = last - first;
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
  return (
    <Card style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="numLg">
          {fmt(last)}
          <Txt v="h3" dim={2}>
            {' '}
            {unit}
          </Txt>
        </Txt>
        {points.length > 1 && (
          <Txt v="caption" dim={1} style={{ fontVariant: ['tabular-nums'] }}>
            {delta === 0 ? 'No change' : `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))} ${unit}`} since {fmtShort(points[0].date)}
          </Txt>
        )}
      </Row>
      {points.length > 1 ? (
        <Sparkline values={points.map((p) => conv(p.kg))} dates={points.map((p) => p.date)} label={`Weight trend, ${fmt(first)} to ${fmt(last)} ${unit}`} />
      ) : (
        <Txt v="caption" dim={2}>
          One more check-in with a weight and the trend line appears.
        </Txt>
      )}
      <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
        Day-to-day swings are normal. The direction over weeks is what matters.
      </Txt>
    </Card>
  );
}

const SPARK_H = 72;

function Sparkline({ values, dates, label }: { values: number[]; dates: string[]; label: string }) {
  const c = useTheme();
  const [w, setW] = useState(0);
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const t0 = new Date(dates[0]).getTime();
  const tN = new Date(dates[dates.length - 1]).getTime();
  const x = (i: number) => pad + (tN === t0 ? 0 : ((new Date(dates[i]).getTime() - t0) / (tN - t0)) * Math.max(0, w - pad * 2));
  const y = (v: number) => (max === min ? SPARK_H / 2 : pad + (1 - (v - min) / span) * (SPARK_H - pad * 2));
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={SPARK_H}>
          <Line x1={pad} x2={w - pad} y1={SPARK_H - 1} y2={SPARK_H - 1} stroke={c.line} strokeWidth={1} />
          <Polyline points={pts} fill="none" stroke={c.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {values.map((v, i) => (
            <Circle key={dates[i]} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4.5 : 3} fill={i === values.length - 1 ? c.ink : c.surface} stroke={c.ink} strokeWidth={2} />
          ))}
        </Svg>
      )}
    </View>
  );
}
