import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { KCAL_BUCKETS, kcalBucketOf, type KcalBucket } from '@/engine/browse';
import { rowMinutes } from '@/engine/families';
import { COMPLETE_AT, NUTRIENTS } from '@/engine/nutrients';
import { PLAN_STYLES } from '@/engine/planStyles';
import { carbStyleFits } from '@/engine/carbStyle';
import { TextIndex, nutrientAmount, parseNutrientQuery, type NutrientQuery } from '@/engine/textSearch';
import type { CarbStyle, MealSlot, NutrientKey, NutrientVector, PlanStyle } from '@/engine/types';
import { food } from '@/state/catalog';
import { useDay } from '@/state/day';
import { useMealLibrary, useSizedTotals, type LibraryMeal } from '@/state/library';
import { today, useStore } from '@/state/store';
import { CARB_NEEDS, CarbFilter } from '@/ui/carbParts';
import {
  ChipRow,
  DIET_OPTIONS,
  MacroLine,
  MealThumb,
  NutrientLine,
  SearchField,
  Segmented,
  SLOT_LABEL,
  SLOT_ORDER,
  dietMatches,
  openLibraryMeal,
  tagLabel,
  topMicros,
  useWho,
} from '@/ui/planParts';
import { Button, Card, Chip, Icon, I, Row, Screen, Txt } from '@/ui/primitives';
import { slotLabelOf } from '@/ui/recipeParts';
import { space, useTheme } from '@/ui/theme';
import { MicroChip } from '@/ui/viz';

type Sort = 'today' | 'protein' | 'light';
type SlotFilter = 'all' | MealSlot;

const PAGE = 24;
const short = (k: NutrientKey) => NUTRIENTS[k].short;

interface Ranked {
  lm: LibraryMeal;
  /** the meal at the person's size */
  totals: NutrientVector;
  /** open nutrients this meal would push past 80% if added on top of today's plan */
  closes: NutrientKey[];
  /** open nutrients it moves a good way toward 80% without finishing them */
  moves: NutrientKey[];
  score: number;
}

export default function Meals() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const favoriteMeals = useStore((s) => s.favoriteMeals);
  const library = useMealLibrary();
  const day = useDay(today());

  const [query, setQuery] = useState('');
  const [slot, setSlot] = useState<SlotFilter>('all');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [style, setStyle] = useState<PlanStyle | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [diet, setDiet] = useState<string[]>(() => profile.diet);
  const carbStyle: CarbStyle = profile.carbStyle ?? 'whole';
  const [sort, setSort] = useState<Sort>('today');
  const [saved, setSaved] = useState(false);
  const [kcal, setKcal] = useState<KcalBucket | null>(null);
  const sized = useSizedTotals(library);

  // a new search or filter starts back at the top of the list
  const filterKey = JSON.stringify([query, slot, cuisine, style, diet, saved, sort, showMore, carbStyle, kcal]);
  const [paged, setPaged] = useState({ key: filterKey, limit: PAGE });
  const limit = paged.key === filterKey ? paged.limit : PAGE;

  const cuisines = useMemo(() => [...new Set(library.map((m) => m.cuisine))].sort(), [library]);
  // only the styles the library really has, in the order the app lists them
  const styles = useMemo(() => {
    const present = new Set(library.map((m) => m.style).filter((x): x is PlanStyle => !!x));
    return (Object.keys(PLAN_STYLES) as PlanStyle[]).filter((k) => present.has(k));
  }, [library]);
  // library meals that need more rice, pasta or bread than the person chose; samples and uploads are never hidden
  const over = useMemo(() => new Set(library.filter((m) => m.fromLibrary && !carbStyleFits(m.carbStyle, carbStyle)).map((m) => m.key)), [library, carbStyle]);
  const overCarbs = (lm: LibraryMeal) => over.has(lm.key);
  const dietChips = useMemo(() => {
    const known: string[] = DIET_OPTIONS.map((d) => d.key);
    const extra = [...new Set(library.flatMap((m) => m.tags.map((t) => t.toLowerCase())))].filter((t) => !known.includes(t)).sort();
    return [...known, ...extra];
  }, [library]);

  // what's still open today: board nutrients with data that today's plan leaves under 80%
  const gaps = useMemo(
    () =>
      day.projectedProgress
        .filter((p) => p.amount != null && !p.complete)
        .map((p) => ({ key: p.key, need: p.req.rda * COMPLETE_AT - (p.amount ?? 0) })),
    [day.projectedProgress],
  );

  // forgiving search: names, plans, cuisines and every ingredient, plurals and typos included
  const index = useMemo(
    () =>
      new TextIndex(
        library.map((m) => ({
          key: m.key,
          fields: [
            { text: m.meal.name, weight: 3 },
            { text: [m.planName, m.cuisine, ...(m.meal.tags ?? []), ...m.tags].join(' '), weight: 1.5 },
            { text: m.meal.ingredients.map((i) => { const f = food(i.foodId); return f ? `${f.name} ${f.head ?? ''}` : ''; }).join(' '), weight: 1 },
          ],
        })),
      ),
    [library],
  );
  // "high iron", "calcium": rank by that nutrient per serving
  const nutrientQuery = useMemo(() => parseNutrientQuery(query), [query]);
  const relevance = useMemo(() => index.search(nutrientQuery ? nutrientQuery.rest : query), [index, nutrientQuery, query]);

  const ranked = useMemo<Ranked[]>(
    () =>
      library.map((lm) => {
        const totals = sized.get(lm.key) ?? lm.totals;
        const hits = gaps.map((g) => ({ key: g.key, share: (totals[g.key] ?? 0) / g.need }));
        const closes = hits.filter((h) => h.share >= 1).sort((a, b) => b.share - a.share).map((h) => h.key);
        const moves = hits.filter((h) => h.share >= 0.3 && h.share < 1).sort((a, b) => b.share - a.share).map((h) => h.key);
        return { lm, totals, closes, moves, score: hits.reduce((s, h) => s + Math.min(1, h.share), 0) };
      }),
    [library, gaps, sized],
  );

  // everything but the carb choice, so we can say how many it hides
  const matching = useMemo(
    () =>
      ranked
        .filter((r) => slot === 'all' || r.lm.meal.slot === slot)
        .filter((r) => !cuisine || r.lm.cuisine === cuisine)
        .filter((r) => !style || r.lm.style === style)
        .filter((r) => dietMatches(r.lm, diet))
        .filter((r) => !saved || favoriteMeals.includes(r.lm.key))
        .filter((r) => !kcal || kcalBucketOf(r.totals.kcal ?? 0) === kcal)
        .filter((r) => !relevance || relevance.has(r.lm.key))
        .filter((r) => !nutrientQuery || (nutrientAmount(r.totals, nutrientQuery.keys) ?? 0) > 0),
    [ranked, slot, cuisine, style, diet, saved, favoriteMeals, kcal, relevance, nutrientQuery],
  );
  const hiddenCount = useMemo(() => matching.filter((r) => over.has(r.lm.key)).length, [matching, over]);

  const shown = useMemo(() => {
    const list = matching.filter((r) => showMore || !over.has(r.lm.key));
    const kcalOf = (r: Ranked) => r.totals.kcal ?? 0;
    const byName = (a: Ranked, b: Ranked) => a.lm.meal.name.localeCompare(b.lm.meal.name);
    const amount = (r: Ranked) => (nutrientQuery ? (nutrientAmount(r.totals, nutrientQuery.keys) ?? 0) : 0);
    const rel = (r: Ranked) => relevance?.get(r.lm.key) ?? 0;
    return list.sort((a, b) => {
      if (nutrientQuery) return amount(b) - amount(a) || byName(a, b);
      if (sort === 'protein') return (b.totals.protein ?? 0) - (a.totals.protein ?? 0) || byName(a, b);
      if (sort === 'light') return kcalOf(a) - kcalOf(b) || byName(a, b);
      if (relevance) return rel(b) - rel(a) || b.score - a.score || byName(a, b);
      return b.score - a.score || b.closes.length - a.closes.length || byName(a, b);
    });
  }, [matching, showMore, over, sort, nutrientQuery, relevance]);

  const filtered = slot !== 'all' || cuisine != null || style != null || diet.length > 0 || saved || kcal != null || query.trim().length > 0;
  const clear = () => {
    setKcal(null);
    setSlot('all');
    setCuisine(null);
    setStyle(null);
    setDiet([]);
    setSaved(false);
    setQuery('');
  };
  const toggleDiet = (k: string) => setDiet((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  const visible = shown.slice(0, limit);
  const nothingSaved = saved && favoriteMeals.length === 0;

  return (
    <Screen
      header={
        <View style={{ marginBottom: space.md }}>
          <Txt v="title">Meal library</Txt>
          <Txt v="body" dim={1} style={{ marginTop: space.xs }}>
            Every meal here comes from a plan, and every plan is built around micronutrients. Add one to your day, or swap it in for a plan meal.
          </Txt>
        </View>
      }>
      <SearchField value={query} onChange={setQuery} label="Search meals" placeholder="Salmon, lentils, high iron" />

      <ChipRow>
        <Chip label="All" active={slot === 'all'} onPress={() => setSlot('all')} />
        {SLOT_ORDER.map((s) => (
          <Chip key={s} label={SLOT_LABEL[s]} active={slot === s} onPress={() => setSlot(slot === s ? 'all' : s)} />
        ))}
      </ChipRow>
      <ChipRow label="Calories at your size">
        <Chip label="Any" accessibilityLabel="Any calories" active={kcal == null} onPress={() => setKcal(null)} />
        {KCAL_BUCKETS.map((b) => (
          <Chip key={b.key} label={b.label} accessibilityLabel={`${b.label} calories`} active={kcal === b.key} onPress={() => setKcal(kcal === b.key ? null : b.key)} />
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
      {(over.size > 0 || showMore) && <CarbFilter carbStyle={carbStyle} showMore={showMore} onChange={setShowMore} hiddenCount={hiddenCount} noun="meals" />}

      <View style={{ marginTop: space.lg }}>
        <Segmented<Sort>
          options={[
            { key: 'today', label: 'Best for today' },
            { key: 'protein', label: 'Most protein' },
            { key: 'light', label: 'Lightest' },
          ]}
          value={sort}
          onChange={setSort}
        />
      </View>

      <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
        <Txt v="caption" dim={2} accessibilityLiveRegion="polite">
          {shown.length} {shown.length === 1 ? 'meal' : 'meals'}
          {nutrientQuery ? `, most ${nutrientQuery.label.toLowerCase()} first` : ''}
        </Txt>
        <Chip
          label={favoriteMeals.length ? `Saved · ${favoriteMeals.length}` : 'Saved'}
          active={saved}
          onPress={() => setSaved(!saved)}
          style={{ height: 30 }}
        />
      </Row>

      <View style={{ marginTop: space.md, gap: space.md }}>
        {shown.length === 0 ? (
          <Card style={{ alignItems: 'flex-start', gap: space.sm }}>
            <Txt v="h3">{nothingSaved ? 'Nothing saved yet' : 'No meals match'}</Txt>
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              {nothingSaved ? 'Tap the bookmark on a meal to keep it here.' : 'Try a simpler search, or loosen a filter.'}
            </Txt>
            {filtered && <Button small kind="secondary" label="Clear filters" onPress={clear} />}
          </Card>
        ) : (
          visible.map((r) => (
            <MealResult key={r.lm.key} r={r} showFit={sort === 'today' && !nutrientQuery} saved={favoriteMeals.includes(r.lm.key)} beyond={overCarbs(r.lm)} nutrientQuery={nutrientQuery} />
          ))
        )}
        {shown.length > visible.length && (
          <Button kind="secondary" label={`Show ${Math.min(PAGE, shown.length - visible.length)} more`} onPress={() => setPaged({ key: filterKey, limit: limit + PAGE })} />
        )}
        {filtered && shown.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" onPress={clear} style={{ alignSelf: 'center', padding: space.sm }}>
            <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
              Clear filters
            </Txt>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

function MealResult({ r, showFit, saved, beyond, nutrientQuery }: { r: Ranked; showFit: boolean; saved: boolean; beyond: boolean; nutrientQuery: NutrientQuery | null }) {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const who = useWho(profile);
  const { lm } = r;
  const top = useMemo(() => topMicros(r.totals, who), [r.totals, who]);
  const slotName = slotLabelOf(lm.meal.slot, lm.slotNames, SLOT_LABEL);
  const minutes = rowMinutes(lm.meal);
  const inPlans = lm.planCount > 1 ? ` · in ${lm.planCount} plans` : '';

  const fit =
    !showFit ? null : r.closes.length > 0 ? (
      <Row gap={4}>
        <Icon name={I.check} size={12} color={c.accent} />
        <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
          Closes {r.closes.slice(0, 3).map(short).join(', ')}
          {r.closes.length > 3 ? ` +${r.closes.length - 3}` : ''} today
        </Txt>
      </Row>
    ) : r.moves.length > 0 ? (
      <Txt v="caption" color={c.ink2} style={{ fontWeight: '700' }}>
        Moves {r.moves.slice(0, 3).map(short).join(', ')} closer today
      </Txt>
    ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${slotName}: ${lm.meal.name}, from ${lm.planName}${lm.planCount > 1 ? `, in ${lm.planCount} plans` : ''}. ${Math.round(r.totals.kcal ?? 0)} kilocalories at your size${beyond ? `. Beyond your carb choice: ${CARB_NEEDS[lm.carbStyle]}` : ''}${saved ? '. Saved' : ''}. Open meal`}
      onPress={() => openLibraryMeal(lm.key)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      <Card>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <MealThumb meal={lm.meal} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label" dim={2}>
                {slotName}
                {minutes ? `  ·  ${minutes} min` : ''}
              </Txt>
              {saved && <Icon name={I.bookmark} size={14} color={c.accent} />}
            </Row>
            <Txt v="h3" numberOfLines={2}>
              {lm.meal.name}
            </Txt>
            <Txt v="caption" dim={2} numberOfLines={1}>
              from {lm.planName}
              {inPlans}
            </Txt>
            <View style={{ marginTop: 2 }}>
              <MacroLine totals={r.totals} />
            </View>
          </View>
        </Row>
        <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={6}>
          {top.map((t) => (
            <MicroChip key={t.key} k={t.key} pct={t.pct} />
          ))}
        </Row>
        {nutrientQuery && (
          <View style={{ marginTop: space.sm }}>
            <NutrientLine query={nutrientQuery} totals={r.totals} who={who} />
          </View>
        )}
        {fit && <View style={{ marginTop: space.sm }}>{fit}</View>}
        {beyond && (
          <Row gap={4} style={{ marginTop: space.sm }}>
            <Icon name={I.info} size={12} color={c.warn} />
            <Txt v="caption" color={c.warn} style={{ fontWeight: '700' }}>
              {CARB_NEEDS[lm.carbStyle]}, beyond your carb choice
            </Txt>
          </Row>
        )}
      </Card>
    </Pressable>
  );
}
