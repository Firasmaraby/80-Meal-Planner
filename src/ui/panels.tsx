import { router } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { gapCloser } from '@/engine/calc';
import { NUTRIENTS } from '@/engine/nutrients';
import type { Tip } from '@/content/tips';
import { FOODS } from '@/state/catalog';
import type { DayData } from '@/state/day';
import { useStore } from '@/state/store';

import { Card, Icon, I, Row, Txt, tap } from './primitives';
import { MAX_WIDTH, radius, space, useTheme } from './theme';
import { NutrientTile, fmtPct } from './viz';

const openNutrient = (key: string) => router.push({ pathname: '/nutrient/[key]', params: { key } });

// ── Board preview ──────────────────────────────────────────────────────────

/**
 * The whole board in miniature on Today: every vitamin and mineral, filling as the
 * day goes. The pale band is what the rest of today's meals will add.
 */
export function BoardPreviewCard({ day }: { day: DayData }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const cols = 9;
  const inner = Math.min(width, MAX_WIDTH) - space.lg * 2 - space.lg * 2;
  // a couple of px slack for the card's hairline borders, so 9 always fit on a row
  const size = Math.floor((inner - 4 - 5 * (cols - 1)) / cols);
  const ghost = new Map(day.projectedProgress.map((p) => [p.key, p]));
  const remaining = day.projectedScore.done - day.score.done;
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel="Open your board" onPress={() => router.push('/board')}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Txt v="label" dim={1}>
              Your board
            </Txt>
            <Txt v="caption" dim={2} style={{ marginTop: 2 }}>
              {remaining > 0
                ? `${remaining} more tile${remaining === 1 ? '' : 's'} complete once you’ve eaten today’s meals`
                : day.score.done > 0
                  ? 'Everything your meals can fill today is filled'
                  : 'Tiles fill as you eat. Done at the dashed 80% line.'}
            </Txt>
          </View>
          <Icon name={I.chevron} size={16} color={c.ink3} />
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: space.md }}>
          {day.progress.map((p) => (
            <NutrientTile
              key={p.key}
              k={p.key}
              pct={p.pct}
              ghost={ghost.get(p.key)?.pct}
              noData={p.amount == null && ghost.get(p.key)?.amount == null}
              size={size}
              onPress={() => openNutrient(p.key)}
            />
          ))}
        </View>
      </Pressable>
    </Card>
  );
}

// ── Gap closer ─────────────────────────────────────────────────────────────

/**
 * Looks at the projection (what you'll have if you finish today's plan) and
 * suggests the smallest whole-food addition that closes what's still missing.
 */
export function GapCloserCard({ day, basis = 'projected' }: { day: DayData; basis?: 'projected' | 'eaten' }) {
  const c = useTheme();
  const addFood = useStore((s) => s.addFood);
  const diet = day.profile.diet;
  const progress = basis === 'projected' ? day.projectedProgress : day.progress;
  const suggestions = gapCloser(progress, FOODS, {
    limit: 3,
    exclude: (f) =>
      (diet.includes('vegetarian') && ['meat', 'poultry', 'fish'].includes(f.category)) ||
      (diet.includes('vegan') && ['meat', 'poultry', 'fish', 'dairy', 'egg'].includes(f.category)) ||
      (diet.includes('pescatarian') && ['meat', 'poultry'].includes(f.category)),
  });
  const unmet = progress.filter((p) => !p.complete && p.amount != null).length;

  if (!suggestions.length) {
    return (
      <Card tone="accentSoft">
        <Row>
          <Icon name={I.spark} color={c.accent} />
          <Txt v="bodyStrong" color={c.accent} style={{ flex: 1 }}>
            {unmet === 0 ? 'Follow today’s plan and every tile on your board crosses 80%.' : 'Nothing simple left to add. Nice work.'}
          </Txt>
        </Row>
      </Card>
    );
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label" dim={1}>
          Gap closer
        </Txt>
        <Icon name={I.bolt} size={16} color={c.vitamin} />
      </Row>
      <Txt v="caption" dim={2} style={{ marginTop: 2 }}>
        {basis === 'projected' ? 'Even after today’s plan, these tiles fall short. One small add fixes each.' : 'Still open today:'}
      </Txt>
      <View style={{ marginTop: space.md, gap: space.sm }}>
        {suggestions.map((s) => {
          const p = progress.find((x) => x.key === s.nutrient)!;
          return (
            <Row key={s.nutrient} gap={space.md} style={{ paddingVertical: 4 }}>
              <View style={{ width: 52 }}>
                <Txt v="bodyStrong">{NUTRIENTS[s.nutrient].short}</Txt>
                <Txt v="caption" dim={2} style={{ fontVariant: ['tabular-nums'] }}>
                  {fmtPct(p.pct)}
                </Txt>
              </View>
              <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/food/[id]', params: { id: s.food.id, grams: String(s.grams), date: day.date } })}>
                <Txt v="bodyStrong" numberOfLines={1}>
                  {s.grams} g {s.food.name.split(',')[0].toLowerCase()}
                </Txt>
                <Txt v="caption" dim={2} numberOfLines={1}>
                  {Math.round(s.kcal)} kcal
                  {s.alsoHelps.length ? ` · also helps ${s.alsoHelps.map((k) => NUTRIENTS[k].short).join(', ')}` : ''}
                </Txt>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add ${s.grams} grams ${s.food.name}`}
                onPress={() => {
                  tap('success');
                  addFood(day.date, s.food.id, s.grams, 'snack');
                }}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={I.add} size={16} color={c.bg} />
              </Pressable>
            </Row>
          );
        })}
      </View>
    </Card>
  );
}

// ── Pillars ────────────────────────────────────────────────────────────────

export function PillarStrip({ day, fishThisWeek }: { day: DayData; fishThisWeek: number }) {
  const c = useTheme();
  const p = day.pillars;
  const tone = (s: string) => (s === 'good' ? c.accent : s === 'over' ? c.danger : s === 'watch' ? c.warn : c.ink3);
  const items = [
    { label: 'Sat fat', value: p.satFat.pct == null ? '—' : `${p.satFat.pct.toFixed(1)}%`, sub: `of kcal · max ${p.satFat.max}%`, status: p.satFat.status, tip: 'satfat' },
    { label: 'Omega 6:3', value: p.omega.ratio == null ? '—' : `${p.omega.ratio.toFixed(1)}:1`, sub: 'aim ≤ 4:1', status: p.omega.status, tip: 'omega' },
    { label: 'Glycemic load', value: `${Math.round(p.glycemicLoad.amount)}`, sub: `aim ≤ ${p.glycemicLoad.max}`, status: p.glycemicLoad.status, tip: 'gl' },
    { label: 'Fatty fish', value: `${fishThisWeek}/2`, sub: 'last 7 days', status: fishThisWeek >= 2 ? 'good' : 'watch', tip: 'omega' },
    { label: 'Sodium', value: `${Math.round(p.sodium.amount).toLocaleString()}`, sub: `mg · max ${p.sodium.max.toLocaleString()}`, status: p.sodium.amount ? p.sodium.status : 'none', tip: 'framework' },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          onPress={() => router.push({ pathname: '/learn', params: { open: it.tip } })}
          style={{ flexGrow: 1, flexBasis: '30%', minWidth: 100, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <Row gap={6}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone(it.status) }} />
            <Txt v="caption" dim={1} style={{ fontWeight: '700', fontSize: 12 }}>
              {it.label}
            </Txt>
          </Row>
          <Txt v="num" style={{ fontSize: 20, marginTop: 4 }}>
            {it.value}
          </Txt>
          <Txt v="caption" dim={2} style={{ fontSize: 11 }}>
            {it.sub}
          </Txt>
        </Pressable>
      ))}
    </View>
  );
}

export function TipCard({ tip }: { tip: Tip }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: c.vitaminSoft }}>
      <Icon name={I.bulb} size={18} color={c.vitamin} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="bodyStrong">{tip.title}</Txt>
        <Txt v="caption" dim={1} style={{ lineHeight: 19 }}>
          {tip.body}
        </Txt>
      </View>
    </View>
  );
}

export function useOpenNutrient() {
  return (key: string) => {
    tap('select');
    openNutrient(key);
  };
}
