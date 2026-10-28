import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { bandFor, bandLabel, calorieTarget } from '@/engine/calc';
import type { MealPlan } from '@/engine/types';
import { useAllPlans } from '@/state/day';
import { useStore } from '@/state/store';
import { Button, Card, Chip, Icon, I, Row, Screen, Txt } from '@/ui/primitives';
import { ChipRow, Fingerprint, FingerprintLegend, MealThumb, Pill, DIET_OPTIONS, bandKey, dietMatches, planStats, tagLabel, useWho, type PlanStats } from '@/ui/planParts';
import { space, useTheme } from '@/ui/theme';

const fmtN = (n: number) => Math.round(n).toLocaleString();

export default function Plans() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const enrollment = useStore((s) => s.enrollment);
  const plans = useAllPlans();
  const who = useWho(profile);

  const mine = useMemo(() => bandFor(calorieTarget(profile)), [profile]);
  const mineKey = bandKey(mine);

  const bands = useMemo(() => {
    const byKey = new Map(plans.map((p) => [bandKey(p.band), p.band]));
    return [...byKey.values()].sort((a, b) => a.min - b.min);
  }, [plans]);
  const cuisines = useMemo(() => [...new Set(plans.map((p) => p.cuisine))].sort(), [plans]);

  const defaultBand = bands.some((b) => bandKey(b) === mineKey) ? mineKey : 'all';
  const [bandSel, setBandSel] = useState<string | null>(null);
  const band = bandSel ?? defaultBand;
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [diet, setDiet] = useState<string[]>(() => profile.diet);

  // diet chips: the five dietary filters, plus any other tag the library uses
  const dietChips = useMemo(() => {
    const known: string[] = DIET_OPTIONS.map((d) => d.key);
    const extra = [...new Set(plans.flatMap((p) => p.tags.map((t) => t.toLowerCase())))].filter((t) => !known.includes(t)).sort();
    return [...known, ...extra];
  }, [plans]);

  const stats = useMemo(() => new Map(plans.map((p) => [p.id, planStats(p, who)])), [plans, who]);

  const shown = useMemo(() => {
    return plans
      .filter((p) => (band === 'all' ? true : bandKey(p.band) === band))
      .filter((p) => (cuisine ? p.cuisine === cuisine : true))
      .filter((p) => dietMatches(p, diet))
      .sort((a, b) => {
        const ea = a.id === enrollment?.planId ? 0 : 1;
        const eb = b.id === enrollment?.planId ? 0 : 1;
        if (ea !== eb) return ea - eb;
        const da = Math.abs(a.band.min - mine.min);
        const db = Math.abs(b.band.min - mine.min);
        return da !== db ? da - db : a.name.localeCompare(b.name);
      });
  }, [plans, band, cuisine, diet, enrollment?.planId, mine.min]);

  const filtered = band !== defaultBand || cuisine != null || diet.length > 0;
  const clear = () => {
    setBandSel('all');
    setCuisine(null);
    setDiet([]);
  };
  const toggleDiet = (k: string) => setDiet((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  return (
    <Screen
      header={
        <View style={{ marginBottom: space.sm }}>
          <Txt v="label" dim={1}>
            Meal plans
          </Txt>
          <Txt v="title" style={{ marginTop: space.sm }}>
            Pick a plan, then just eat
          </Txt>
          <Row gap={space.sm} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
            <View
              accessible
              accessibilityLabel={`Your recommended calorie band is ${bandLabel(mine)} kilocalories`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 999, backgroundColor: c.ink }}>
              <Icon name={I.target} size={14} color={c.bg} />
              <Txt v="caption" color={c.bg} style={{ fontWeight: '800' }}>
                Your band · {bandLabel(mine)} kcal
              </Txt>
            </View>
            <Txt v="caption" dim={2}>
              from your profile
            </Txt>
          </Row>
        </View>
      }>
      <ChipRow label="Calories">
        <Chip label="All" active={band === 'all'} onPress={() => setBandSel('all')} />
        {bands.map((b) => (
          <Chip
            key={bandKey(b)}
            label={`${bandLabel(b)}${bandKey(b) === mineKey ? ' · you' : ''}`}
            active={band === bandKey(b)}
            onPress={() => setBandSel(bandKey(b))}
          />
        ))}
      </ChipRow>
      <ChipRow label="Cuisine">
        <Chip label="Any" active={cuisine == null} onPress={() => setCuisine(null)} />
        {cuisines.map((q) => (
          <Chip key={q} label={q} active={cuisine === q} onPress={() => setCuisine(cuisine === q ? null : q)} />
        ))}
      </ChipRow>
      <ChipRow label="Diet">
        {dietChips.map((t) => (
          <Chip key={t} label={tagLabel(t)} active={diet.includes(t)} onPress={() => toggleDiet(t)} />
        ))}
      </ChipRow>

      <View style={{ marginTop: space.lg, gap: 6 }}>
        <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
          Each square is a vitamin, mineral or fiber. Filled means the plan’s average day reaches 80% of <Txt v="caption" style={{ fontWeight: '700' }}>your</Txt> daily need.
        </Txt>
        <FingerprintLegend />
      </View>

      <View style={{ marginTop: space.lg, gap: space.md }}>
        {shown.length === 0 ? (
          <Card style={{ alignItems: 'flex-start', gap: space.sm }}>
            <Txt v="h3">No plans match</Txt>
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              Try another calorie band or loosen a filter.
            </Txt>
            <Button small kind="secondary" label="Show all plans" onPress={clear} />
          </Card>
        ) : (
          shown.map((p) => (
            <PlanCard key={p.id} plan={p} stats={stats.get(p.id)!} enrolled={p.id === enrollment?.planId} yourBand={bandKey(p.band) === mineKey} />
          ))
        )}
        {filtered && shown.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" onPress={clear} style={{ alignSelf: 'center', padding: space.sm }}>
            <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
              Show all plans
            </Txt>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

function PlanCard({ plan, stats, enrolled, yourBand }: { plan: MealPlan; stats: PlanStats; enrolled: boolean; yourBand: boolean }) {
  const c = useTheme();
  const n = plan.days.length || 1;
  const tags = plan.tags.slice(0, 3);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${plan.name}, ${plan.cuisine}, ${bandLabel(plan.band)} calories. ${stats.covered} of ${stats.of} nutrients covered${enrolled ? '. Your current plan' : ''}`}
      onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      <Card style={enrolled ? { borderColor: c.accent, borderWidth: 1.5 } : undefined}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.md}>
          <View style={{ flex: 1 }}>
            <Txt v="label" dim={2}>
              {plan.cuisine}
            </Txt>
            <Txt v="h2" style={{ marginTop: 2 }}>
              {plan.name}
            </Txt>
          </View>
          {enrolled ? <Pill label="Your plan" icon={I.check} color={c.accent} bg={c.accentSoft} /> : <Icon name={I.chevron} size={16} color={c.ink3} />}
        </Row>

        <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
          <Pill label={`${bandLabel(plan.band)} kcal`} color={yourBand ? c.bg : c.ink2} bg={yourBand ? c.ink : c.surface2} />
          <Pill label={`${n} ${n === 1 ? 'day' : 'days'}`} />
          {tags.map((t) => (
            <Pill key={t} label={tagLabel(t)} />
          ))}
        </Row>

        <MealStrip plan={plan} />

        <View style={{ height: 1, backgroundColor: c.line, marginVertical: space.md }} />

        <Row gap={space.lg} style={{ alignItems: 'center' }}>
          <Fingerprint progress={stats.progress} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="numLg">
              {stats.covered}
              <Txt v="h3" dim={2}>
                /{stats.of}
              </Txt>
            </Txt>
            <Txt v="caption" dim={1} style={{ fontWeight: '700' }}>
              covered
            </Txt>
            <Txt v="caption" dim={2} style={{ marginTop: 4, fontVariant: ['tabular-nums'] }}>
              avg {fmtN(stats.avg.kcal ?? 0)} kcal · {fmtN(stats.avg.protein ?? 0)} g protein
            </Txt>
          </View>
        </Row>
      </Card>
    </Pressable>
  );
}

const STRIP_MAX = 6;

/** A peek at what you'd eat: the plan's meals in order from day 1, drawn as plates. */
function MealStrip({ plan }: { plan: MealPlan }) {
  const c = useTheme();
  const meals = useMemo(() => [...plan.days].sort((a, b) => a.day - b.day).flatMap((d) => d.meals), [plan]);
  if (meals.length === 0) return null;
  const shown = meals.slice(0, STRIP_MAX);
  const more = meals.length - shown.length;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ marginHorizontal: -space.lg, marginTop: space.md }}
      contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
      {shown.map((m) => (
        <View key={m.id} style={{ width: 68, alignItems: 'center', gap: 6 }}>
          <MealThumb meal={m} size={44} />
          <Txt v="caption" dim={1} numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, textAlign: 'center' }}>
            {m.name}
          </Txt>
        </View>
      ))}
      {more > 0 && (
        <View style={{ paddingHorizontal: space.md, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: c.surface2 }}>
          <Txt v="caption" dim={1} style={{ fontWeight: '800', fontSize: 12 }}>
            +{more} more
          </Txt>
        </View>
      )}
    </ScrollView>
  );
}
