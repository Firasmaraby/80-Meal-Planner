import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type { NutrientKey } from '@/engine/types';
import { useDay, useHistory } from '@/state/day';
import { today } from '@/state/store';
import { useOpenNutrient } from '@/ui/panels';
import { Card, Chip, Row, Screen, Section, Txt } from '@/ui/primitives';
import { MAX_WIDTH, groupColor, radius, space, useTheme } from '@/ui/theme';
import { NutrientTile } from '@/ui/viz';

const GROUPS: { title: string; keys: NutrientKey[] }[] = [
  { title: 'Vitamins', keys: ['vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'folate', 'b12', 'choline'] },
  { title: 'Minerals', keys: ['calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'copper', 'manganese', 'selenium', 'iodine'] },
  { title: 'Fiber', keys: ['fiber'] },
];

export default function Board() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const date = today();
  const day = useDay(date);
  const history = useHistory(35, date);
  const open = useOpenNutrient();
  const [show, setShow] = useState<'eaten' | 'projected'>('eaten');
  const cols = 5;
  const inner = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const tileSize = Math.floor((inner - space.sm * (cols - 1)) / cols);

  const progress = show === 'eaten' ? day.progress : day.projectedProgress;
  const byKey = new Map(progress.map((p) => [p.key, p]));
  const ghostBy = new Map(day.projectedProgress.map((p) => [p.key, p]));

  return (
    <Screen
      header={
        <View style={{ marginBottom: space.lg }}>
          <Txt v="label" dim={1}>
            Micronutrient board
          </Txt>
          <Txt v="title" style={{ marginTop: space.sm }}>
            {day.score.done} of {day.score.of} complete
          </Txt>
          <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
            Each tile is done at 80% of your daily need: the dashed line. Fill the board, not the calorie counter.
          </Txt>
        </View>
      }>
      <Row gap={space.sm}>
        <Chip label="Eaten so far" active={show === 'eaten'} onPress={() => setShow('eaten')} />
        <Chip label="If I finish my plan" active={show === 'projected'} onPress={() => setShow('projected')} />
      </Row>

      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {g.keys.map((k) => {
              const p = byKey.get(k);
              if (!p) return null;
              const ghost = show === 'eaten' ? ghostBy.get(k)?.pct : undefined;
              return (
                <NutrientTile
                  key={k}
                  k={k}
                  pct={p.pct}
                  ghost={ghost}
                  noData={p.amount == null && (ghostBy.get(k)?.amount == null)}
                  size={tileSize}
                  onPress={() => open(k)}
                />
              );
            })}
          </View>
        </Section>
      ))}

      <Legend />

      <Section title="Consistency · last 5 weeks">
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <View>
              <Txt v="numLg">{history.streak}</Txt>
              <Txt v="caption" dim={2}>
                day streak of Eighty days
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt v="numLg">{history.eightyDaysThisWeek}/7</Txt>
              <Txt v="caption" dim={2}>
                this week
              </Txt>
            </View>
          </Row>
          <Heatmap days={history.days} />
          <Txt v="caption" dim={2} style={{ marginTop: space.md, lineHeight: 18 }}>
            A missed day doesn’t break anything. Five good days a week, every week, beats a perfect week followed by quitting.
          </Txt>
        </Card>
      </Section>

      <Txt v="caption" dim={2} style={{ marginTop: space.xl, lineHeight: 18 }}>
        Targets are the US/Canadian Dietary Reference Intakes (National Academies) for your age, sex and life stage. Tiles marked “no data” are
        nutrients most food databases don’t measure, so they don’t count against you.
      </Txt>
    </Screen>
  );
}

function Legend() {
  const c = useTheme();
  const g = groupColor(c, 'vitamin');
  const swatch = (bg: string, label: string, dashed?: boolean) => (
    <Row gap={6}>
      <View
        style={{
          width: 14,
          height: dashed ? 0 : 14,
          borderRadius: 4,
          backgroundColor: dashed ? 'transparent' : bg,
          borderTopWidth: dashed ? 1.5 : 0,
          borderStyle: 'dashed',
          borderColor: c.ink3,
        }}
      />
      <Txt v="caption" dim={1} style={{ fontSize: 12 }}>
        {label}
      </Txt>
    </Row>
  );
  return (
    <Row gap={space.lg} style={{ marginTop: space.lg, flexWrap: 'wrap' }}>
      {swatch(g.fg, 'Complete')}
      {swatch(g.soft, 'Eaten / still planned')}
      {swatch('', '80% line', true)}
    </Row>
  );
}

function Heatmap({ days }: { days: { date: string; ratio: number; logged: boolean; eightyDay: boolean }[] }) {
  const c = useTheme();
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <View style={{ gap: 6 }}>
      {weeks.map((w, i) => (
        <Row key={i} gap={6}>
          {w.map((d) => {
            const bg = !d.logged ? c.surface2 : d.eightyDay ? c.accent : d.ratio >= 0.5 ? c.accentSoft : c.vitaminSoft;
            return (
              <View
                key={d.date}
                accessibilityLabel={`${d.date}: ${d.logged ? `${Math.round(d.ratio * 100)}% of board` : 'not logged'}`}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  maxHeight: 40,
                  borderRadius: radius.sm - 2,
                  backgroundColor: bg,
                  borderWidth: d.date === today() ? 2 : 0,
                  borderColor: c.ink,
                }}
              />
            );
          })}
        </Row>
      ))}
    </View>
  );
}
