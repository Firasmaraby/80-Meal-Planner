import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { bandFor, bandLabel, calorieTarget } from '@/engine/calc';
import {
  SIZE_LABEL,
  bandKeyOf,
  familyBands,
  familyCarbStyle,
  familyVisible,
  pickSize,
  signatureNames,
  type PlanFamily,
  type SizePick,
} from '@/engine/families';
import { PLAN_STYLES } from '@/engine/planStyles';
import { plainText } from '@/engine/richText';
import type { CarbStyle, MealPlan, PlanStyle } from '@/engine/types';
import { FOOD_INDEX } from '@/state/catalog';
import { useFamilies } from '@/state/families';
import { useStore } from '@/state/store';
import { CARB_NEEDS, CarbFilter } from '@/ui/carbParts';
import { Button, Card, Chip, Icon, I, Row, Screen, Txt } from '@/ui/primitives';
import { ChipRow, Fingerprint, FingerprintLegend, MealThumb, Pill, DIET_OPTIONS, bandKey, displayTags, dietMatches, planStats, tagLabel, useWho } from '@/ui/planParts';
import { space, useTheme } from '@/ui/theme';

const fmtN = (n: number) => Math.round(n).toLocaleString();
const PAGE = 12;
const roundTo50 = (n: number) => Math.round(n / 50) * 50;

/** A family on screen: which size the person would get, and whether they are on one of its sizes already. */
interface Entry {
  family: PlanFamily;
  pick: SizePick;
  /** the size the person is enrolled in, if it is one of this family's */
  enrolled?: MealPlan;
  /** shown only because "Show more" is on: the family needs more carbs than the person chose */
  beyond: boolean;
}

export default function Plans() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const enrollment = useStore((s) => s.enrollment);
  const families = useFamilies();
  const carbStyle: CarbStyle = profile.carbStyle ?? 'whole';
  const target = useMemo(() => calorieTarget(profile), [profile]);

  const mine = useMemo(() => bandFor(target), [target]);
  const mineKey = bandKey(mine);

  const bands = useMemo(() => {
    const byKey = new Map(families.flatMap((f) => familyBands(f)).map((b) => [bandKeyOf(b), b]));
    return [...byKey.values()].sort((a, b) => a.min - b.min);
  }, [families]);
  const cuisines = useMemo(() => [...new Set(families.map((f) => f.cuisine))].sort(), [families]);
  // only the styles the library really has, in the order the app lists them
  const styles = useMemo(() => {
    const present = new Set(families.map((f) => f.style).filter((x): x is PlanStyle => !!x));
    return (Object.keys(PLAN_STYLES) as PlanStyle[]).filter((k) => present.has(k));
  }, [families]);
  const picks = useMemo(() => new Map(families.map((f) => [f.id, pickSize(f, target)])), [families, target]);

  const defaultBand = bands.some((b) => bandKeyOf(b) === mineKey) ? mineKey : 'all';
  const [bandSel, setBandSel] = useState<string | null>(null);
  const band = bandSel ?? defaultBand;
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [style, setStyle] = useState<PlanStyle | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [diet, setDiet] = useState<string[]>(() => profile.diet);
  // a new filter starts back at the top of the list
  const filterKey = `${band}|${cuisine}|${style}|${diet.join(',')}|${showMore}|${carbStyle}`;
  const [paged, setPaged] = useState({ key: filterKey, limit: PAGE });
  const limit = paged.key === filterKey ? paged.limit : PAGE;

  // diet chips: the five dietary filters, plus any other tag the library uses
  const dietChips = useMemo(() => {
    const known: string[] = DIET_OPTIONS.map((d) => d.key);
    const extra = [...new Set(families.flatMap((f) => f.tags.map((t) => t.toLowerCase())))].filter((t) => !known.includes(t)).sort();
    return [...known, ...extra];
  }, [families]);

  // everything but the carb choice, so we can say how many it hides
  const matching = useMemo(
    () =>
      families
        .filter((f) => (band === 'all' ? true : familyBands(f).some((b) => bandKeyOf(b) === band)))
        .filter((f) => (cuisine ? f.cuisine === cuisine : true))
        .filter((f) => (style ? f.style === style : true))
        .filter((f) => dietMatches(f, diet)),
    [families, band, cuisine, style, diet],
  );
  const hasBeyond = useMemo(() => families.some((f) => !familyVisible(f, carbStyle, FOOD_INDEX)), [families, carbStyle]);
  const hiddenCount = useMemo(() => matching.filter((f) => !familyVisible(f, carbStyle, FOOD_INDEX)).length, [matching, carbStyle]);

  const shown = useMemo<Entry[]>(() => {
    return matching
      .map((family): Entry => ({
        family,
        pick: picks.get(family.id)!,
        enrolled: family.sizes.find((p) => p.id === enrollment?.planId),
        beyond: !familyVisible(family, carbStyle, FOOD_INDEX),
      }))
      .filter((e) => showMore || !e.beyond)
      .sort((a, b) => {
        const ea = a.enrolled ? 0 : 1;
        const eb = b.enrolled ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return a.pick.gap !== b.pick.gap ? a.pick.gap - b.pick.gap : a.family.name.localeCompare(b.family.name);
      });
  }, [matching, picks, enrollment?.planId, carbStyle, showMore]);

  const filtered = band !== defaultBand || cuisine != null || style != null || diet.length > 0;
  const clear = () => {
    setBandSel('all');
    setCuisine(null);
    setStyle(null);
    setDiet([]);
  };
  const toggleDiet = (k: string) => setDiet((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  const visible = shown.slice(0, limit);

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
            key={bandKeyOf(b)}
            label={`${bandLabel(b)}${bandKeyOf(b) === mineKey ? ' · you' : ''}`}
            active={band === bandKeyOf(b)}
            onPress={() => setBandSel(bandKeyOf(b))}
          />
        ))}
      </ChipRow>
      <ChipRow label="Cuisine">
        <Chip label="Any" active={cuisine == null} onPress={() => setCuisine(null)} />
        {cuisines.map((q) => (
          <Chip key={q} label={q} active={cuisine === q} onPress={() => setCuisine(cuisine === q ? null : q)} />
        ))}
      </ChipRow>
      {styles.length > 0 && (
        <ChipRow label="Style">
          <Chip label="Any" accessibilityLabel="Any style" active={style == null} onPress={() => setStyle(null)} />
          {styles.map((k) => (
            <Chip
              key={k}
              label={PLAN_STYLES[k].label}
              accessibilityLabel={`Style: ${PLAN_STYLES[k].label}. ${PLAN_STYLES[k].blurb}`}
              active={style === k}
              onPress={() => setStyle(style === k ? null : k)}
            />
          ))}
        </ChipRow>
      )}
      <ChipRow label="Diet">
        {dietChips.map((t) => (
          <Chip key={t} label={tagLabel(t)} active={diet.includes(t)} onPress={() => toggleDiet(t)} />
        ))}
      </ChipRow>
      {(hasBeyond || showMore) && <CarbFilter carbStyle={carbStyle} showMore={showMore} onChange={setShowMore} hiddenCount={hiddenCount} noun="plans" />}

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
          visible.map((e) => <PlanCard key={e.family.id} entry={e} carbStyle={carbStyle} yourBand={e.pick.covered} />)
        )}
        {shown.length > visible.length && (
          <Button kind="secondary" label={`Show ${Math.min(PAGE, shown.length - visible.length)} more`} onPress={() => setPaged({ key: filterKey, limit: limit + PAGE })} />
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

function PlanCard({ entry, carbStyle, yourBand }: { entry: Entry; carbStyle: CarbStyle; yourBand: boolean }) {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const who = useWho(profile);
  const { family, pick, enrolled: enrolledSize, beyond } = entry;
  // the size you are on wins; otherwise the one that fits
  const plan = enrolledSize ?? pick.plan;
  const enrolled = !!enrolledSize;
  const stats = useMemo(() => planStats(plan, who), [plan, who]);
  const dishes = useMemo(() => (family.isLibrary ? signatureNames(plan, 3) : []), [family.isLibrary, plan]);
  const n = plan.days.length || 1;
  const tags = displayTags(family.tags, family.style).slice(0, 3);
  const styleLabel = family.style ? PLAN_STYLES[family.style].label : undefined;
  const where = family.regions.length ? family.regions.join(', ') : undefined;
  const sizedKcal = roundTo50(stats.avg.kcal ?? 0);
  const sizeLine = !family.isLibrary
    ? undefined
    : enrolled
      ? `You are on the ${plan.size ? `${SIZE_LABEL[plan.size]} ` : ''}size, about ${fmtN(sizedKcal)} kcal`
      : pick.covered
        ? `Sized for you: about ${fmtN(sizedKcal)} kcal`
        : `Closest size: about ${fmtN(sizedKcal)} kcal`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        `${family.name}`,
        styleLabel,
        `${family.cuisine}${where ? `, ${where}` : ''}`,
        family.isLibrary ? undefined : `${bandLabel(plan.band)} calories`,
        sizeLine,
        `${stats.covered} of ${stats.of} nutrients covered`,
        beyond ? `Uses more carbs than you chose: ${CARB_NEEDS[familyCarbStyle(family, FOOD_INDEX)]}` : undefined,
        enrolled ? 'Your current plan' : undefined,
      ]
        .filter(Boolean)
        .join('. ')}
      onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      <Card style={enrolled ? { borderColor: c.accent, borderWidth: 1.5 } : undefined}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.md}>
          <View style={{ flex: 1 }}>
            <Txt v="label" dim={2}>
              {family.cuisine}
              {where ? `  ·  ${where}` : ''}
            </Txt>
            <Txt v="h2" style={{ marginTop: 2 }}>
              {family.name}
            </Txt>
          </View>
          {enrolled ? <Pill label="Your plan" icon={I.check} color={c.accent} bg={c.accentSoft} /> : <Icon name={I.chevron} size={16} color={c.ink3} />}
        </Row>

        <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
          {styleLabel ? <Pill label={styleLabel} color={c.bg} bg={c.ink} /> : null}
          {!family.isLibrary && <Pill label={`${bandLabel(plan.band)} kcal`} color={yourBand ? c.bg : c.ink2} bg={yourBand ? c.ink : c.surface2} />}
          {!family.isLibrary && <Pill label={`${n} ${n === 1 ? 'day' : 'days'}`} />}
          {tags.map((t) => (
            <Pill key={t} label={tagLabel(t)} />
          ))}
          {beyond ? <Pill label={CARB_NEEDS[familyCarbStyle(family, FOOD_INDEX)]} icon={I.info} color={c.warn} bg={c.vitaminSoft} /> : null}
        </Row>

        {family.isLibrary && family.summary ? (
          <Txt v="body" dim={1} numberOfLines={3} style={{ marginTop: space.sm, lineHeight: 21 }}>
            {plainText(family.summary)}
          </Txt>
        ) : null}

        {dishes.length > 0 ? (
          <View style={{ marginTop: space.sm, gap: 3 }}>
            <Txt v="label" dim={2}>
              Signature dishes
            </Txt>
            {dishes.map((d) => (
              <Row key={d} gap={8} style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.ink3, marginTop: 8 }} />
                <Txt v="body" style={{ flex: 1 }} numberOfLines={2}>
                  {d}
                </Txt>
              </Row>
            ))}
          </View>
        ) : (
          <MealStrip plan={plan} />
        )}

        {sizeLine ? (
          <Row gap={6} style={{ marginTop: space.md }}>
            <Icon name={I.target} size={14} color={pick.covered || enrolled ? c.accent : c.warn} />
            <Txt v="caption" style={{ fontWeight: '700', flex: 1 }} color={pick.covered || enrolled ? c.accent : c.warn}>
              {sizeLine}
            </Txt>
          </Row>
        ) : null}

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
