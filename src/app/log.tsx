import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';

import { boardProgress, foodHighlights, scaled } from '@/engine/calc';
import { COMPLETE_AT, NUTRIENTS } from '@/engine/nutrients';
import type { Food, MealSlot, NutrientKey, Profile } from '@/engine/types';
import { FOODS, food, foodSearch } from '@/state/catalog';
import { useExtendedFoods } from '@/state/useExtendedFoods';
import { useDay } from '@/state/day';
import { today, useStore } from '@/state/store';
import { Chip, Icon, I, IconButton, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';
import { MicroChip } from '@/ui/viz';

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

/** Respect the diet filters when we choose what to suggest (search stays unfiltered: you asked for it). */
function fitsDiet(f: Food, diet: string[]): boolean {
  if (diet.includes('vegan') && ['meat', 'poultry', 'fish', 'dairy', 'egg'].includes(f.category)) return false;
  if (diet.includes('vegetarian') && ['meat', 'poultry', 'fish'].includes(f.category)) return false;
  if (diet.includes('pescatarian') && ['meat', 'poultry'].includes(f.category)) return false;
  if (diet.includes('dairy-free') && f.category === 'dairy') return false;
  return true;
}

/** The portion we use for quick-add and for the preview chips. */
const portionOf = (f: Food) => f.servings?.[0] ?? { label: '100 g', g: 100 };

export default function LogFood() {
  const c = useTheme();
  const { date: dateParam, slot: slotParam } = useLocalSearchParams<{ date?: string; slot?: string }>();
  const date = dateParam ?? today();
  const [slot, setSlot] = useState<MealSlot>(isSlot(slotParam) ? slotParam : slotByClock());
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const extendedReady = useExtendedFoods(); // the searchable library grows once the extended tier has loaded
  const profile = useStore((s) => s.profile);
  const favorites = useStore((s) => s.favorites);
  const recents = useStore((s) => s.recents);
  const includeRare = useStore((s) => s.includeRare);
  const setIncludeRare = useStore((s) => s.setIncludeRare);
  const addFood = useStore((s) => s.addFood);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const q = query.trim();
  const results = useMemo(() => (q ? foodSearch.search(q, { includeRare }).map((h) => h.food) : []), [q, includeRare, extendedReady]);

  const favFoods = useMemo(() => favorites.map(food).filter((f): f is Food => !!f).slice(0, 10), [favorites]);
  const recentFoods = useMemo(() => {
    const skip = new Set(favFoods.map((f) => f.id));
    return recents
      .map(food)
      .filter((f): f is Food => !!f && !skip.has(f.id))
      .slice(0, 8);
  }, [recents, favFoods]);

  // what today's plan still leaves open: board nutrients with data that end the day under 80%
  const projected = useDay(date).projectedProgress;
  const { diet } = profile;
  const gaps = useMemo(
    () =>
      projected
        .filter((p) => p.amount != null && !p.complete)
        .map((p) => ({ key: p.key, need: p.req.rda * COMPLETE_AT - (p.amount ?? 0), pct: p.pct })),
    [projected],
  );
  const suggestions = useMemo(() => {
    if (gaps.length === 0) return { foods: [] as Food[], keys: [] as NutrientKey[] };
    const skip = new Set([...favFoods, ...recentFoods].map((f) => f.id));
    const scored = FOODS.filter(
      (f) => !f.rare && (f.rank ?? 50) >= 50 && f.category !== 'sweet' && f.category !== 'oil_fat' && !f.tags?.includes('processed') && fitsDiet(f, diet) && !skip.has(f.id),
    )
      .map((f) => {
        const v = scaled(f, portionOf(f).g);
        // share of each open gap that one typical serving covers (capped at 1, so one huge value can't win)
        const hits = gaps.map((g) => ({ key: g.key, share: Math.min(1, (v[g.key] ?? 0) / g.need) }));
        return { f, score: hits.reduce((s, h) => s + h.share, 0), keys: hits.filter((h) => h.share >= 0.1).map((h) => h.key) };
      })
      .filter((x) => x.score >= 0.25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    // the chips show the gaps these foods work on, most-covered first
    const tally = new Map<NutrientKey, number>();
    for (const x of scored) for (const k of x.keys) tally.set(k, (tally.get(k) ?? 0) + 1);
    const keys = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return { foods: scored.map((x) => x.f), keys };
  }, [gaps, diet, favFoods, recentFoods]);

  const quickAdd = (f: Food) => {
    const portion = portionOf(f);
    tap('success');
    addFood(date, f.id, portion.g, slot);
    setAdded((a) => ({ ...a, [f.id]: portion.label }));
    clearTimeout(timers.current[f.id]);
    timers.current[f.id] = setTimeout(() => {
      setAdded((a) => {
        const { [f.id]: _, ...rest } = a;
        return rest;
      });
    }, 2600);
  };

  const open = (f: Food) =>
    router.push({ pathname: '/food/[id]', params: { id: f.id, date, slot } });

  const row = (f: Food, chipKeys?: NutrientKey[]) => (
    <FoodRow key={f.id} f={f} profile={profile} chipKeys={chipKeys} added={added[f.id]} onOpen={() => open(f)} onAdd={() => quickAdd(f)} />
  );

  const isToday = date === today();

  return (
    <Screen
      scroll={false}
      contentStyle={{ flex: 1 }}
      header={
        <View style={{ marginBottom: space.md, gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt v="label" dim={1}>
                Log food · {isToday ? 'today' : fmtDate(date)}
              </Txt>
              <Txt v="title" style={{ marginTop: 2 }}>
                What did you eat?
              </Txt>
            </View>
            <IconButton icon={I.close} label="Close" onPress={() => router.back()} />
          </Row>
          <SearchField value={query} onChange={setQuery} />
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {SLOTS.map((s) => (
              <Chip key={s.key} label={s.label} active={slot === s.key} onPress={() => setSlot(s.key)} style={{ height: 30 }} />
            ))}
          </Row>
        </View>
      }>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}>
        {q ? (
          <View style={{ gap: space.sm }}>
            {results.map((f) => row(f))}
            {results.length === 0 && (
              <View style={{ paddingVertical: space.xl, alignItems: 'center', gap: 4 }}>
                <Txt v="h3">Nothing for “{q}”</Txt>
                <Txt v="caption" dim={1} style={{ textAlign: 'center' }}>
                  Try a simpler word, like “salmon” or “oats”.
                </Txt>
              </View>
            )}
            {results.length < 5 && (
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Include rare items in search"
                accessibilityState={{ checked: includeRare }}
                onPress={() => {
                  tap('select');
                  setIncludeRare(!includeRare);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface2, marginTop: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{includeRare ? 'Including rare items' : 'Can’t find it? Include rare items'}</Txt>
                  <Txt v="caption" dim={1}>
                    Organ meats, wild game, unusual produce and more.
                  </Txt>
                </View>
                <Switch
                  value={includeRare}
                  onValueChange={(v) => {
                    tap('select');
                    setIncludeRare(v);
                  }}
                  trackColor={{ true: c.accent, false: c.line }}
                  thumbColor="#FFFFFF"
                />
              </Pressable>
            )}
          </View>
        ) : (
          <View>
            {favFoods.length > 0 && (
              <Section title="Favorites">
                <View style={{ gap: space.sm }}>{favFoods.map((f) => row(f))}</View>
              </Section>
            )}
            {recentFoods.length > 0 && (
              <Section title="Recent">
                <View style={{ gap: space.sm }}>{recentFoods.map((f) => row(f))}</View>
              </Section>
            )}
            {suggestions.foods.length > 0 && (
              <Section title="Fills what today’s plan leaves open">
                <Txt v="caption" dim={2} style={{ marginTop: -space.xs }}>
                  Still short on {suggestions.keys.slice(0, 3).map((k) => NUTRIENTS[k].label.replace(/ \(.+\)/, '').toLowerCase()).join(', ')}
                  {suggestions.keys.length > 3 ? ' and more' : ''}. Shown per typical serving.
                </Txt>
                <View style={{ gap: space.sm }}>{suggestions.foods.map((f) => row(f, suggestions.keys))}</View>
              </Section>
            )}
            {favFoods.length === 0 && recentFoods.length === 0 && (
              <Txt v="caption" dim={2} style={{ marginTop: space.lg, lineHeight: 18 }}>
                Search any food to see it as vitamins and minerals. Tap + to log a typical serving, or the row to choose an amount. Hearted foods stay right here.
              </Txt>
            )}
          </View>
        )}
      </ScrollView>
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
        autoFocus
        value={value}
        onChangeText={onChange}
        placeholder="Search foods: kiwi, salmon, lentils…"
        placeholderTextColor={c.ink3}
        accessibilityLabel="Search foods"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
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

function FoodRow({
  f,
  profile,
  chipKeys,
  added,
  onOpen,
  onAdd,
}: {
  f: Food;
  profile: Profile;
  chipKeys?: NutrientKey[];
  added?: string;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const c = useTheme();
  const portion = portionOf(f);
  const kcal = Math.round(((f.n.kcal ?? 0) * portion.g) / 100);
  const chips = chipKeys
    ? boardProgress(scaled(f, portion.g), profile, chipKeys)
        .filter((x) => x.amount != null && x.pct >= 0.05)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3)
    : foodHighlights(f, portion.g, profile, 2);
  const done = added != null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingLeft: space.lg, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: done ? c.accent : c.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${f.name}, ${kcal} kcal per ${portion.label}. Choose an amount`}
        onPress={onOpen}
        style={({ pressed }) => ({ flex: 1, gap: 6, opacity: pressed ? 0.7 : 1 })}>
        <View>
          <Txt v="bodyStrong" numberOfLines={2}>
            {f.name}
          </Txt>
          <Txt v="caption" color={done ? c.accent : c.ink3} style={done ? { fontWeight: '700' } : undefined} numberOfLines={1}>
            {done ? `Added · ${added}` : `${kcal} kcal · ${portion.label}${portion.label.includes('100 g') ? '' : `, ${portion.g} g`}`}
          </Txt>
        </View>
        {chips.length > 0 && (
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {chips.map((h) => (
              <MicroChip key={h.key} k={h.key} pct={h.pct} />
            ))}
          </Row>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={done ? `Added ${f.name}. Add another ${portion.label}` : `Add ${portion.label} of ${f.name}`}
        hitSlop={6}
        onPress={onAdd}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? c.accentSoft : c.ink,
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}>
        <Icon name={done ? I.check : I.add} size={17} color={done ? c.accent : c.bg} />
      </Pressable>
    </View>
  );
}
