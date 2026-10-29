import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { WEEKDAYS, dayLabel, daysUntilWeekday, groupPrep, type PrepItem } from '@/lib/kitchen';
import { FOOD_INDEX } from '@/state/catalog';
import { useKitchen, useWeek } from '@/state/kitchenStore';
import { today, useStore } from '@/state/store';
import { Button, Card, Chip, Icon, I, IconButton, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { SLOT_LABEL } from '@/ui/planParts';
import { radius, space, useTheme } from '@/ui/theme';

export default function Prep() {
  const c = useTheme();
  const enrollment = useStore((s) => s.enrollment);
  const household = useKitchen((s) => s.householdSize);
  const prepDay = useKitchen((s) => s.prepDay);
  const setPrepDay = useKitchen((s) => s.setPrepDay);
  const [done, setDone] = useState<Set<string>>(() => new Set());

  const now = today();
  const start = enrollment && enrollment.startedOn > now ? enrollment.startedOn : now;
  const week = useWeek(start);
  const groups = useMemo(() => groupPrep(week, FOOD_INDEX, household), [week, household]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const prepped = groups.reduce((n, g) => n + g.items.filter((i) => done.has(i.foodId)).length, 0);
  const wait = daysUntilWeekday(now, prepDay);

  const toggle = (id: string) => {
    tap('select');
    setDone((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen bottomInset={40} header={<IconButton icon={I.back} label="Back" onPress={back} />}>
      <Txt v="title" style={{ marginTop: space.md }}>
        Prep day
      </Txt>
      <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
        Cook a few things once and the week gets easier. This is what your next 7 days call for
        {household > 1 ? `, for ${household} people` : ''}.
      </Txt>

      <Card style={{ marginTop: space.lg }}>
        <Txt v="h3">Your prep day: {WEEKDAYS[prepDay]}</Txt>
        <Txt v="caption" dim={2} style={{ marginTop: 2 }}>
          {wait === 0 ? 'That’s today.' : wait === 1 ? 'That’s tomorrow.' : `That’s in ${wait} days.`}
        </Txt>
        <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.md }}>
          {WEEKDAYS.map((d, i) => (
            <Chip key={d} label={d.slice(0, 3)} active={prepDay === i} onPress={() => setPrepDay(i)} />
          ))}
        </Row>
      </Card>

      {total === 0 ? (
        <Card style={{ marginTop: space.xl }}>
          <Txt v="h3">Nothing to batch-cook</Txt>
          <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
            {enrollment
              ? 'Your next 7 days have no grains, legumes or cooked proteins to make ahead.'
              : 'Follow a plan and the grains, beans and proteins worth cooking ahead show up here.'}
          </Txt>
          {!enrollment && <Button label="Browse plans" icon={I.plans} style={{ marginTop: space.md }} onPress={() => router.replace('/plans')} />}
        </Card>
      ) : (
        <Section
          title="Prep checklist"
          action={
            <Txt v="caption" dim={2} style={{ fontVariant: ['tabular-nums'] }}>
              {prepped} of {total} done
            </Txt>
          }>
          {groups.map((g) => (
            <View key={g.kind} style={{ gap: space.sm, marginTop: space.sm }}>
              <Txt v="h2">{g.label}</Txt>
              <Row gap={space.sm} style={{ alignItems: 'flex-start', padding: space.md, borderRadius: radius.md, backgroundColor: c.surface2 }}>
                <Icon name={I.info} size={16} color={c.ink2} />
                <Txt v="caption" dim={1} style={{ flex: 1, lineHeight: 18 }}>
                  {g.tip}
                </Txt>
              </Row>
              <Card style={{ paddingVertical: space.xs }}>
                {g.items.map((it, i) => (
                  <PrepRow key={it.foodId} item={it} first={!i} on={done.has(it.foodId)} onToggle={() => toggle(it.foodId)} today={now} />
                ))}
              </Card>
            </View>
          ))}
        </Section>
      )}
    </Screen>
  );
}

function PrepRow({ item, first, on, onToggle, today: todayDate }: { item: PrepItem; first: boolean; on: boolean; onToggle: () => void; today: string }) {
  const c = useTheme();
  const name = `${item.name}${item.detail ? `, ${item.detail}` : ''}`;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${name}, ${item.qty}, used in ${item.uses.length} ${item.uses.length === 1 ? 'meal' : 'meals'}`}
      onPress={onToggle}
      style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <View
        style={{
          marginTop: 2,
          width: 24,
          height: 24,
          borderRadius: radius.sm / 2,
          borderWidth: 2,
          borderColor: on ? c.ink : c.ink3,
          backgroundColor: on ? c.ink : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {on && <Icon name={I.check} size={13} color={c.bg} />}
      </View>
      <View style={{ flex: 1, gap: 2, opacity: on ? 0.5 : 1 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" style={{ textDecorationLine: on ? 'line-through' : 'none' }}>
              {item.name}
            </Txt>
            {item.detail ? (
              <Txt v="caption" dim={2}>
                {item.detail}
              </Txt>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt v="num">{item.qty}</Txt>
            {item.hint ? (
              <Txt v="caption" dim={2}>
                {item.hint}
              </Txt>
            ) : null}
          </View>
        </Row>
        <View style={{ marginTop: space.xs, gap: 2 }}>
          {item.uses.map((u) => (
            <Txt key={`${u.date}-${u.mealId}`} v="caption" dim={1}>
              {dayLabel(u.date, todayDate)} {SLOT_LABEL[u.slot].toLowerCase()} · {u.mealName} · {u.grams} g
            </Txt>
          ))}
        </View>
      </View>
    </Pressable>
  );
}
