import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { boardProgress } from '@/engine/calc';
import type { Profile } from '@/engine/types';
import type { DayMeal } from '@/state/day';
import { useStore } from '@/state/store';

import { MealArt } from './MealArt';
import { Button, Icon, IconButton, I, Row, Txt, tap } from './primitives';
import { radius, space, useTheme } from './theme';
import { MicroChip } from './viz';

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as const;

export function MealCard({ m, date, planId, profile }: { m: DayMeal; date: string; planId?: string; profile: Profile }) {
  const c = useTheme();
  const logMeal = useStore((s) => s.logMeal);
  const unlogMeal = useStore((s) => s.unlogMeal);
  const removeMealFromDay = useStore((s) => s.removeMealFromDay);
  const top = boardProgress(m.totals, profile)
    .filter((x) => x.amount != null)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);
  const kcal = Math.round(m.totals.kcal ?? 0);
  const protein = Math.round(m.totals.protein ?? 0);

  return (
    <View style={styles.row}>
      {/* timeline rail */}
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: m.eaten ? c.accent : c.surface, borderColor: m.eaten ? c.accent : c.ink3 }]}>
          {m.eaten && <Icon name={I.check} size={11} color={c.accentInk} />}
        </View>
        <View style={[styles.line, { backgroundColor: c.line }]} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${SLOT_LABEL[m.meal.slot]}: ${m.meal.name}. Open details and swaps`}
        onPress={() => router.push({ pathname: '/meal/[id]', params: { id: m.meal.id, date } })}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: c.surface, borderColor: m.eaten ? c.accentSoft : c.line, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="label" dim={2}>
            {SLOT_LABEL[m.meal.slot]}
            {m.meal.prepMinutes ? `  ·  ${m.meal.prepMinutes} min` : ''}
          </Txt>
          {m.source === 'added' ? (
            <Row gap={4}>
              <Icon name={I.meals} size={12} color={c.mineral} />
              <Txt v="caption" color={c.mineral} style={{ fontWeight: '700', fontSize: 11 }}>
                {m.replaces ? 'swapped in' : 'added'}
              </Txt>
            </Row>
          ) : (
            m.edited && (
              <Row gap={4}>
                <Icon name={I.swap} size={12} color={c.vitamin} />
                <Txt v="caption" color={c.vitamin} style={{ fontWeight: '700', fontSize: 11 }}>
                  customised
                </Txt>
              </Row>
            )
          )}
        </Row>
        <Row gap={space.md} style={{ alignItems: 'flex-start', marginTop: 2 }}>
          <View style={{ flex: 1 }}>
            <Txt v="h3" color={m.eaten ? c.ink2 : c.ink}>
              {m.meal.name}
            </Txt>
            <Row style={{ marginTop: 6 }} gap={space.md}>
              <Txt v="caption" dim={1}>
                <Txt v="caption" style={{ fontWeight: '800' }}>
                  {kcal}
                </Txt>{' '}
                kcal
              </Txt>
              <Txt v="caption" dim={1}>
                <Txt v="caption" style={{ fontWeight: '800' }} color={c.protein}>
                  {protein} g
                </Txt>{' '}
                protein
              </Txt>
            </Row>
          </View>
          <MealArt ingredients={m.ingredients} size={52} />
        </Row>
        <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={6}>
          {top.map((t) => (
            <MicroChip key={t.key} k={t.key} pct={t.pct} />
          ))}
        </Row>
        <Row style={{ marginTop: space.md }} gap={space.sm}>
          {m.eaten ? (
            <Button small kind="done" icon={I.undo} label="Eaten · undo" onPress={() => unlogMeal(date, m.meal.id)} />
          ) : (
            <Button
              small
              icon={I.check}
              label="Ate it"
              onPress={() => {
                tap('success');
                logMeal(date, m.meal, m.ingredients, planId);
              }}
            />
          )}
          <Button
            small
            kind="secondary"
            icon={I.swap}
            label="Swap / edit"
            onPress={() => router.push({ pathname: '/meal/[id]', params: { id: m.meal.id, date } })}
          />
          <View style={{ flex: 1 }} />
          <IconButton icon={I.trash} label={`Remove ${m.meal.name} from this day`} onPress={() => removeMealFromDay(date, m.meal.id)} />
        </Row>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  line: { width: 2, flex: 1, marginTop: 4, borderRadius: 1 },
  card: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: space.lg, marginBottom: space.md },
});
