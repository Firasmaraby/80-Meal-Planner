import { router } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { NUTRIENTS } from '@/engine/nutrients';
import type { NutrientKey } from '@/engine/types';
import { useDay, useHistory } from '@/state/day';
import { daysBetween, today, useStore } from '@/state/store';
import { useOpenNutrient } from '@/ui/panels';
import { Button, Card, Chip, Row, Screen, Section, Txt } from '@/ui/primitives';
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
  const focus = day.profile.focus;
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
                  focus={focus.includes(k)}
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

      <FocusCycle />

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

/** Six-week Focus 3 cycles: lock in, then add three more. */
function FocusCycle() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const lockInFocus = useStore((s) => s.lockInFocus);
  const setFocus = useStore((s) => s.setFocus);
  const [picking, setPicking] = useState<NutrientKey[] | null>(null);
  const weeks = daysBetween(profile.focusStartedAt ?? today(), today()) / 7;
  const ready = weeks >= 6;
  const candidates = GROUPS.flatMap((g) => g.keys).filter((k) => !profile.lockedIn.includes(k) && k !== 'b7' && k !== 'iodine');

  return (
    <Section title="Focus cycle">
      <Card>
        <Txt v="h3">{ready ? 'Six weeks done. Lock them in.' : `Week ${Math.floor(weeks) + 1} of 6`}</Txt>
        <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
          {ready
            ? 'Your first three are habit now. Keep them, and pick the next three to build on.'
            : 'Stick with the same three until the foods that cover them are automatic. Then add the next three.'}
        </Txt>
        {profile.lockedIn.length > 0 && (
          <Row gap={6} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
            <Txt v="caption" dim={2}>
              Locked in:
            </Txt>
            {profile.lockedIn.map((k) => (
              <Txt key={k} v="caption" style={{ fontWeight: '700' }}>
                {NUTRIENTS[k].short}
              </Txt>
            ))}
          </Row>
        )}
        {picking ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>
              {candidates.map((k) => (
                <Chip
                  key={k}
                  label={NUTRIENTS[k].label.replace(/ \(.+\)/, '')}
                  active={picking.includes(k)}
                  color={c.accent}
                  onPress={() =>
                    setPicking(picking.includes(k) ? picking.filter((x) => x !== k) : picking.length < 3 ? [...picking, k] : picking)
                  }
                />
              ))}
            </View>
            <Button
              label={ready ? `Lock in & start ${picking.length}/3` : `Change focus (${picking.length}/3)`}
              disabled={picking.length !== 3}
              style={{ marginTop: space.md }}
              onPress={() => {
                if (ready) lockInFocus(picking);
                else setFocus(picking);
                setPicking(null);
              }}
            />
          </>
        ) : (
          <Button
            kind={ready ? 'primary' : 'secondary'}
            label={ready ? 'Choose my next three' : 'Change my focus'}
            style={{ marginTop: space.md }}
            onPress={() => setPicking(ready ? [] : profile.focus)}
          />
        )}
        <Button kind="ghost" small label="How Focus 3 works" style={{ marginTop: space.xs }} onPress={() => router.push({ pathname: '/learn', params: { open: 'three' } })} />
      </Card>
    </Section>
  );
}
