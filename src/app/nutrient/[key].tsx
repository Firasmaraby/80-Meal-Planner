import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { COMPLETE_AT, NUTRIENTS } from '@/engine/nutrients';
import type { NutrientKey } from '@/engine/types';
import { FOODS, food } from '@/state/catalog';
import { useDay } from '@/state/day';
import { today, useStore } from '@/state/store';
import { Button, Card, I, IconButton, Row, Screen, Section, Txt } from '@/ui/primitives';
import { groupColor, space, useTheme } from '@/ui/theme';
import { NutrientTile, fmtAmount, fmtPct } from '@/ui/viz';

/** Tap any tile: what it does, where today's came from, and the easiest foods to close it. */
export default function NutrientSheet() {
  const c = useTheme();
  const { key } = useLocalSearchParams<{ key: NutrientKey }>();
  const info = NUTRIENTS[key];
  const day = useDay(today());
  const focus = useStore((s) => s.profile.focus);
  const setFocus = useStore((s) => s.setFocus);
  const p = day.progress.find((x) => x.key === key);
  const proj = day.projectedProgress.find((x) => x.key === key);
  if (!info || !p) return null;
  const g = groupColor(c, key === 'fiber' ? 'fiber' : info.group);

  // today's sources
  const sources = new Map<string, number>();
  for (const l of day.logs) {
    const v = food(l.foodId)?.n[key];
    if (v) sources.set(l.foodId, (sources.get(l.foodId) ?? 0) + (v * l.grams) / 100);
  }
  const srcList = [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // best everyday foods: % of target per typical 100 g portion
  const best = FOODS.filter((f) => !f.rare && (f.rank ?? 0) >= 50 && (f.n[key] ?? 0) > 0 && f.category !== 'sweet')
    .map((f) => {
      const portion = f.servings?.[0] ?? { label: '100 g', g: 100 };
      return { f, portion, pct: ((f.n[key]! * portion.g) / 100) / p.req.rda };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);

  return (
    <Screen
      bottomInset={40}
      header={
        <Row style={{ justifyContent: 'flex-end' }}>
          <IconButton icon={I.close} label="Close" onPress={() => router.back()} />
        </Row>
      }>
      <Row gap={space.lg}>
        <NutrientTile k={key} pct={p.pct} ghost={proj?.pct} noData={p.amount == null} size={84} />
        <View style={{ flex: 1 }}>
          <Txt v="label" color={g.fg}>
            {info.group === 'mineral' ? 'Mineral' : key === 'fiber' ? 'Fiber' : 'Vitamin'}
          </Txt>
          <Txt v="title">{info.label}</Txt>
          <Txt v="caption" dim={1} style={{ marginTop: 2 }}>
            {fmtAmount(p.amount, info.unit)} of {fmtAmount(p.req.rda, info.unit)} {p.req.kind === 'ai' ? '(AI)' : '(RDA)'}
          </Txt>
        </View>
      </Row>

      {info.why && (
        <Txt v="body" style={{ marginTop: space.lg, lineHeight: 22 }}>
          {info.why}
        </Txt>
      )}

      <Card style={{ marginTop: space.lg, gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="caption" dim={1}>
            Your 80% target
          </Txt>
          <Txt v="num">{fmtAmount(p.req.rda * COMPLETE_AT, info.unit)}</Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="caption" dim={1}>
            {p.complete ? 'Done today' : 'Still to go'}
          </Txt>
          <Txt v="num" color={p.complete ? c.accent : c.ink}>
            {p.complete ? fmtPct(p.pct) : fmtAmount(Math.max(0, p.req.rda * COMPLETE_AT - (p.amount ?? 0)), info.unit)}
          </Txt>
        </Row>
        {proj && day.plan && (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="caption" dim={1}>
              After today’s plan
            </Txt>
            <Txt v="num">{fmtPct(proj.pct)}</Txt>
          </Row>
        )}
        {p.req.ul && (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="caption" dim={1}>
              Upper limit
            </Txt>
            <Txt v="num" color={p.overUL ? c.danger : c.ink2}>
              {fmtAmount(p.req.ul, info.unit)}
            </Txt>
          </Row>
        )}
        {info.sparse && (
          <Txt v="caption" dim={2} style={{ marginTop: 4 }}>
            Most food databases don’t measure this one, so your real intake is probably higher than shown.
          </Txt>
        )}
      </Card>

      {srcList.length > 0 && (
        <Section title="Where today’s came from">
          {srcList.map(([id, amt]) => (
            <Row key={id} style={{ justifyContent: 'space-between' }}>
              <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>
                {food(id)?.name}
              </Txt>
              <Txt v="num">{fmtPct(amt / p.req.rda)}</Txt>
            </Row>
          ))}
        </Section>
      )}

      <Section title="Easy wins">
        {best.map(({ f, portion, pct }) => (
          <Pressable key={f.id} onPress={() => router.push({ pathname: '/food/[id]', params: { id: f.id, grams: String(portion.g) } })}>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong" numberOfLines={1}>
                  {f.name}
                </Txt>
                <Txt v="caption" dim={2}>
                  {portion.label} ({portion.g} g)
                </Txt>
              </View>
              <Txt v="num" color={pct >= COMPLETE_AT ? c.accent : c.ink}>
                {fmtPct(pct)}
              </Txt>
            </Row>
          </Pressable>
        ))}
      </Section>

      {!focus.includes(key) && key !== 'b7' && key !== 'iodine' && (
        <Button
          kind="secondary"
          label={focus.length < 3 ? 'Add to my focus 3' : `Swap into focus (replaces ${NUTRIENTS[focus[2]].short})`}
          style={{ marginTop: space.xl }}
          onPress={() => setFocus([...focus.slice(0, 2), key])}
        />
      )}
    </Screen>
  );
}
