import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';

import { AISLES, aggregateGrocery, planPreviewDays, type GroceryItem } from '@/lib/kitchen';
import { FOOD_INDEX } from '@/state/catalog';
import { usePlan } from '@/state/day';
import { useKitchen, useWeek } from '@/state/kitchenStore';
import { today, useStore } from '@/state/store';
import { Button, Card, Icon, I, IconButton, Row, Screen, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

const label = (i: GroceryItem) => `${i.name}${i.detail ? `, ${i.detail}` : ''}`;

export default function Grocery() {
  const c = useTheme();
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const enrollment = useStore((s) => s.enrollment);
  const id = planId ?? enrollment?.planId;
  const enrolledHere = !!enrollment && enrollment.planId === id;
  const plan = usePlan(id, enrolledHere ? enrollment.version : undefined);

  const household = useKitchen((s) => s.householdSize);
  const setHousehold = useKitchen((s) => s.setHouseholdSize);
  const pantry = useKitchen((s) => s.pantry);
  const togglePantry = useKitchen((s) => s.togglePantry);

  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [showHave, setShowHave] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // the next 7 days: from today, or from the plan's start if it has not begun
  const start = enrollment && enrollment.startedOn > today() ? enrollment.startedOn : today();
  const week = useWeek(start);
  const items = useMemo<GroceryItem[]>(() => {
    // following this plan: what is really planned, with swaps, sizing, added library meals and skipped meals
    // just looking at another plan: its first 7 days as written
    const days = enrolledHere ? week : plan ? planPreviewDays(plan, start) : [];
    return aggregateGrocery(days, FOOD_INDEX, household);
  }, [enrolledHere, week, plan, start, household]);

  const have = useMemo(() => new Set(pantry), [pantry]);
  const need = items.filter((i) => !have.has(i.foodId));
  const haveItems = items.filter((i) => have.has(i.foodId));
  const groups = AISLES.map((a) => ({ aisle: a, items: need.filter((i) => i.aisle === a) })).filter((g) => g.items.length);
  const inBasket = need.filter((i) => checked.has(i.foodId)).length;

  const toggle = (key: string) => {
    tap('select');
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const share = async () => {
    const lines = [`Grocery list · ${plan?.name} · next 7 days · for ${household}`];
    for (const g of groups) {
      const todo = g.items.filter((i) => !checked.has(i.foodId));
      if (!todo.length) continue;
      lines.push('', g.aisle.toUpperCase());
      for (const i of todo) lines.push(`- ${label(i)}: ${i.qty}${i.hint ? ` (${i.hint})` : ''}`);
    }
    const message = lines.join('\n');
    try {
      await Share.share({ message });
    } catch {
      const nav = (globalThis as { navigator?: { clipboard?: { writeText: (s: string) => Promise<void> } } }).navigator;
      if (Platform.OS === 'web' && nav?.clipboard) {
        await nav.clipboard.writeText(message).catch(() => {});
        setNotice('Copied to your clipboard');
        setTimeout(() => setNotice(null), 2500);
      }
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!plan) {
    return (
      <Screen header={<IconButton icon={I.back} label="Back" onPress={back} />}>
        <Txt v="title" style={{ marginTop: space.lg }}>
          Grocery list
        </Txt>
        <Card style={{ marginTop: space.lg }}>
          <Txt v="h3">Pick a plan first</Txt>
          <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
            Your list is built from the meals in the plan you follow.
          </Txt>
          <Button label="Browse plans" icon={I.plans} style={{ marginTop: space.md }} onPress={() => router.replace('/plans')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      bottomInset={40}
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <IconButton icon={I.back} label="Back" onPress={back} />
          <Row gap={space.sm}>
            <Button small kind="secondary" icon={I.flame} label="Prep day" onPress={() => router.push('/prep')} />
            <Button small kind="secondary" icon={I.upload} label="Share list" onPress={share} />
          </Row>
        </Row>
      }>
      <Txt v="label" dim={2}>
        {plan.name}
      </Txt>
      <Txt v="title" style={{ marginTop: 2 }}>
        Grocery list
      </Txt>
      <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
        {enrolledHere ? 'Everything for your next 7 days' : 'Everything for the first 7 days'}, with your swaps applied.{' '}
        <Txt v="caption" style={{ fontWeight: '700' }}>
          {inBasket} of {need.length} in the basket.
        </Txt>
      </Txt>
      {notice && (
        <Txt v="caption" color={c.accent} style={{ marginTop: 6, fontWeight: '700' }}>
          {notice}
        </Txt>
      )}

      <Card style={{ marginTop: space.lg, paddingVertical: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt v="h3">Cooking for {household}</Txt>
            <Txt v="caption" dim={2}>
              {household === 1 ? 'Just you' : 'Amounts are for everyone'}
            </Txt>
          </View>
          <Row gap={space.sm}>
            <IconButton icon={I.minus} label="Cook for one fewer person" onPress={() => setHousehold(household - 1)} />
            <IconButton icon={I.add} label="Cook for one more person" onPress={() => setHousehold(household + 1)} />
          </Row>
        </Row>
      </Card>

      {items.length === 0 && (
        <Txt v="caption" dim={2} style={{ marginTop: space.xl }}>
          Nothing to buy for the next 7 days. Add a meal to a day and it shows up here.
        </Txt>
      )}

      {groups.map((g) => {
        const done = g.items.filter((i) => checked.has(i.foodId)).length;
        return (
          <View key={g.aisle} style={{ marginTop: space.xl, gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label" dim={1}>
                {g.aisle}
              </Txt>
              <Txt v="caption" dim={2} style={{ fontVariant: ['tabular-nums'] }}>
                {done}/{g.items.length}
              </Txt>
            </Row>
            <Card style={{ paddingVertical: space.xs }}>
              {g.items.map((it, i) => {
                const on = checked.has(it.foodId);
                return (
                  <View key={it.foodId} style={{ paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: space.sm }}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${label(it)}, ${it.qty}${it.hint ? `, ${it.hint}` : ''}`}
                      onPress={() => toggle(it.foodId)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <View
                        style={{
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
                      <View style={{ flex: 1, opacity: on ? 0.45 : 1 }}>
                        <Txt v="bodyStrong" style={{ textDecorationLine: on ? 'line-through' : 'none' }}>
                          {it.name}
                        </Txt>
                        {it.detail ? (
                          <Txt v="caption" dim={2}>
                            {it.detail}
                          </Txt>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', opacity: on ? 0.45 : 1 }}>
                        <Txt v="num">{it.qty}</Txt>
                        {it.hint ? (
                          <Txt v="caption" dim={2}>
                            {it.hint}
                          </Txt>
                        ) : null}
                      </View>
                    </Pressable>
                    <HaveIt name={label(it)} onPress={() => togglePantry(it.foodId)} />
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}

      {haveItems.length > 0 && (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showHave }}
            accessibilityLabel={`Already have, ${haveItems.length} items`}
            onPress={() => {
              tap('select');
              setShowHave((v) => !v);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
            <Txt v="label" dim={1}>
              Already have · {haveItems.length}
            </Txt>
            <View style={{ transform: [{ rotate: showHave ? '90deg' : '0deg' }] }}>
              <Icon name={I.chevron} size={14} color={c.ink3} />
            </View>
          </Pressable>
          {showHave && (
            <Card style={{ paddingVertical: space.xs }}>
              {haveItems.map((it, i) => (
                <Row key={it.foodId} style={{ paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyStrong" dim={1}>
                      {label(it)}
                    </Txt>
                    <Txt v="caption" dim={2}>
                      {it.qty}
                      {it.hint ? ` · ${it.hint}` : ''}
                    </Txt>
                  </View>
                  <Button small kind="secondary" label="Need it" accessibilityLabel={`Need ${label(it)} after all`} onPress={() => togglePantry(it.foodId)} />
                </Row>
              ))}
            </Card>
          )}
        </View>
      )}
    </Screen>
  );
}

/** A small "I already have this" pill under an item. */
function HaveIt({ name, onPress }: { name: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`I already have ${name}`}
      hitSlop={6}
      onPress={() => {
        tap('select');
        onPress();
      }}
      style={{ alignSelf: 'flex-start', marginLeft: 24 + space.md, height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: c.surface2, justifyContent: 'center' }}>
      <Txt v="caption" dim={1} style={{ fontSize: 12, fontWeight: '700' }}>
        Have it
      </Txt>
    </Pressable>
  );
}
