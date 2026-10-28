import { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { COMPLETE_AT, NUTRIENTS } from '@/engine/nutrients';
import type { MealSlot, NutrientKey } from '@/engine/types';
import { food } from '@/state/catalog';
import { useDay } from '@/state/day';
import { useMealLibrary, type LibraryMeal } from '@/state/library';
import { today, useStore } from '@/state/store';
import {
  ChipRow,
  DIET_OPTIONS,
  MacroLine,
  MealThumb,
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
import { radius, space, useTheme } from '@/ui/theme';
import { MicroChip } from '@/ui/viz';

type Sort = 'today' | 'protein' | 'light';
type SlotFilter = 'all' | MealSlot;

const PAGE = 24;
const short = (k: NutrientKey) => NUTRIENTS[k].short;

interface Ranked {
  lm: LibraryMeal;
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
  const [diet, setDiet] = useState<string[]>(() => profile.diet);
  const [sort, setSort] = useState<Sort>('today');
  const [saved, setSaved] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // a new search or filter starts back at the top of the list
  useEffect(() => setLimit(PAGE), [query, slot, cuisine, diet, saved, sort]);

  const cuisines = useMemo(() => [...new Set(library.map((m) => m.cuisine))].sort(), [library]);
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

  const haystack = useMemo(
    () => new Map(library.map((m) => [m.key, [m.meal.name, ...m.meal.ingredients.map((i) => food(i.foodId)?.name ?? '')].join(' ').toLowerCase()])),
    [library],
  );

  const ranked = useMemo<Ranked[]>(
    () =>
      library.map((lm) => {
        const hits = gaps.map((g) => ({ key: g.key, share: (lm.totals[g.key] ?? 0) / g.need }));
        const closes = hits.filter((h) => h.share >= 1).sort((a, b) => b.share - a.share).map((h) => h.key);
        const moves = hits.filter((h) => h.share >= 0.3 && h.share < 1).sort((a, b) => b.share - a.share).map((h) => h.key);
        return { lm, closes, moves, score: hits.reduce((s, h) => s + Math.min(1, h.share), 0) };
      }),
    [library, gaps],
  );

  const shown = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = ranked
      .filter((r) => slot === 'all' || r.lm.meal.slot === slot)
      .filter((r) => !cuisine || r.lm.cuisine === cuisine)
      .filter((r) => dietMatches(r.lm, diet))
      .filter((r) => !saved || favoriteMeals.includes(r.lm.key))
      .filter((r) => tokens.every((t) => haystack.get(r.lm.key)?.includes(t)));
    const kcal = (r: Ranked) => r.lm.totals.kcal ?? 0;
    const byName = (a: Ranked, b: Ranked) => a.lm.meal.name.localeCompare(b.lm.meal.name);
    return list.sort((a, b) => {
      if (sort === 'protein') return (b.lm.totals.protein ?? 0) - (a.lm.totals.protein ?? 0) || byName(a, b);
      if (sort === 'light') return kcal(a) - kcal(b) || byName(a, b);
      return b.score - a.score || b.closes.length - a.closes.length || byName(a, b);
    });
  }, [ranked, slot, cuisine, diet, saved, favoriteMeals, query, haystack, sort]);

  const filtered = slot !== 'all' || cuisine != null || diet.length > 0 || saved || query.trim().length > 0;
  const clear = () => {
    setSlot('all');
    setCuisine(null);
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
      <SearchField value={query} onChange={setQuery} />

      <ChipRow>
        <Chip label="All" active={slot === 'all'} onPress={() => setSlot('all')} />
        {SLOT_ORDER.map((s) => (
          <Chip key={s} label={SLOT_LABEL[s]} active={slot === s} onPress={() => setSlot(slot === s ? 'all' : s)} />
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
          visible.map((r) => <MealResult key={r.lm.key} r={r} showFit={sort === 'today'} saved={favoriteMeals.includes(r.lm.key)} />)
        )}
        {shown.length > visible.length && (
          <Button kind="secondary" label={`Show ${Math.min(PAGE, shown.length - visible.length)} more`} onPress={() => setLimit((n) => n + PAGE)} />
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

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useTheme();
  return (
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
        value={value}
        onChangeText={onChange}
        placeholder="Search meals or ingredients: salmon, lentils…"
        placeholderTextColor={c.ink3}
        accessibilityLabel="Search meals"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, height: 48, color: c.ink, fontSize: 16, outlineStyle: 'none' } as never}
      />
      {value.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChange('')}>
          <Icon name={I.close} size={14} color={c.ink3} />
        </Pressable>
      )}
    </View>
  );
}

function MealResult({ r, showFit, saved }: { r: Ranked; showFit: boolean; saved: boolean }) {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const who = useWho(profile);
  const { lm } = r;
  const top = useMemo(() => topMicros(lm.totals, who), [lm.totals, who]);

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
      accessibilityLabel={`${SLOT_LABEL[lm.meal.slot]}: ${lm.meal.name}, from ${lm.planName}. ${Math.round(lm.totals.kcal ?? 0)} kilocalories${saved ? '. Saved' : ''}. Open meal`}
      onPress={() => openLibraryMeal(lm.key)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      <Card>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <MealThumb meal={lm.meal} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label" dim={2}>
                {SLOT_LABEL[lm.meal.slot]}
                {lm.meal.prepMinutes ? `  ·  ${lm.meal.prepMinutes} min` : ''}
              </Txt>
              {saved && <Icon name={I.bookmark} size={14} color={c.accent} />}
            </Row>
            <Txt v="h3" numberOfLines={2}>
              {lm.meal.name}
            </Txt>
            <Txt v="caption" dim={2} numberOfLines={1}>
              from {lm.planName}
            </Txt>
            <View style={{ marginTop: 2 }}>
              <MacroLine totals={lm.totals} />
            </View>
          </View>
        </Row>
        <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={6}>
          {top.map((t) => (
            <MicroChip key={t.key} k={t.key} pct={t.pct} />
          ))}
        </Row>
        {fit && <View style={{ marginTop: space.sm }}>{fit}</View>}
      </Card>
    </Pressable>
  );
}
