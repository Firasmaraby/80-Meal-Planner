import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';

import { roundGrams } from '@/engine/calc';
import type { Food, FoodCategory, Ingredient } from '@/engine/types';
import { food } from '@/state/catalog';
import { planDayFor, usePlan } from '@/state/day';
import { addDays, today, useStore } from '@/state/store';
import { Button, Card, Icon, I, IconButton, Row, Screen, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

const AISLES = ['Produce', 'Proteins', 'Legumes & grains', 'Dairy', 'Nuts & seeds', 'Pantry'] as const;
type Aisle = (typeof AISLES)[number];

const AISLE_OF: Partial<Record<FoodCategory, Aisle>> = {
  fruit: 'Produce',
  vegetable: 'Produce',
  meat: 'Proteins',
  poultry: 'Proteins',
  fish: 'Proteins',
  egg: 'Proteins',
  legume: 'Legumes & grains',
  grain: 'Legumes & grains',
  dairy: 'Dairy',
  nut_seed: 'Nuts & seeds',
};

interface Item {
  id: string;
  name: string;
  detail?: string;
  grams: number;
  qty: string;
  hint?: string;
  aisle: Aisle;
}

const fmtQty = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${roundGrams(g)} g`);

const fmtCount = (n: number) => {
  if (n >= 10) return String(Math.round(n));
  const r = Math.round(n * 2) / 2;
  const whole = Math.floor(r);
  const half = r - whole === 0.5;
  if (!whole) return '½';
  return half ? `${whole}½` : String(whole);
};

const PLURALIZE = /^(cup|slice|fillet|clove|piece|stalk|head|can|stick|leaf|sprig|ear|breast|thigh|bunch|handful|serving|patty|link|wedge|spear|floret|pod|stem)\b/i;

/** "≈ 7 medium" from the food's first household serving, when there is one. */
function servingHint(f: Food | undefined, grams: number): string | undefined {
  const s = f?.servings?.[0];
  if (!s || !s.g) return undefined;
  const m = s.label.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+(.*)$/);
  let qty = 1;
  let label = s.label;
  if (m) {
    qty = m[1].includes('/') ? Number(m[1].split('/')[0]) / Number(m[1].split('/')[1]) : Number(m[1]);
    label = m[2];
  }
  const n = (grams / s.g) * qty;
  if (n < 0.25) return undefined;
  const text = fmtCount(n);
  if (n > 1 && PLURALIZE.test(label)) label = label.replace(PLURALIZE, (w) => (w.toLowerCase().endsWith('s') ? w : `${w}s`));
  return `≈ ${text} ${label}`;
}

export default function Grocery() {
  const c = useTheme();
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const enrollment = useStore((s) => s.enrollment);
  const planEdits = useStore((s) => s.planEdits);
  const dayEdits = useStore((s) => s.dayEdits);
  const id = planId ?? enrollment?.planId;
  const enrolledHere = !!enrollment && enrollment.planId === id;
  const plan = usePlan(id, enrolledHere ? enrollment.version : undefined);

  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const startedOn = enrollment?.startedOn;
  const items = useMemo<Item[]>(() => {
    if (!plan || !plan.days.length) return [];
    const sorted = [...plan.days].sort((a, b) => a.day - b.day);
    const totals = new Map<string, number>();
    const add = (ings: Ingredient[]) => {
      for (const ing of ings) totals.set(ing.foodId, (totals.get(ing.foodId) ?? 0) + ing.grams);
    };
    // next 7 days: from today (or the plan's start, if it hasn't begun) when enrolled; otherwise Day 1..7 cycling
    const from = enrolledHere && startedOn && startedOn > today() ? startedOn : today();
    for (let i = 0; i < 7; i++) {
      const date = addDays(from, i);
      const d = enrolledHere && startedOn ? planDayFor(plan, startedOn, date) : sorted[i % sorted.length];
      if (!d) continue;
      for (const meal of d.meals) {
        const edit = enrolledHere ? (dayEdits[`${date}|${meal.id}`] ?? planEdits[`${plan.id}|${meal.id}`]) : planEdits[`${plan.id}|${meal.id}`];
        add(edit ?? meal.ingredients);
      }
    }
    return [...totals.entries()].map(([foodId, grams]) => {
      const f = food(foodId);
      const [first, ...rest] = (f?.name ?? foodId).split(',');
      return {
        id: foodId,
        name: first.trim(),
        detail: rest.join(',').trim() || undefined,
        grams,
        qty: fmtQty(grams),
        hint: servingHint(f, grams),
        aisle: (f && AISLE_OF[f.category]) || 'Pantry',
      };
    });
  }, [plan, enrolledHere, startedOn, planEdits, dayEdits]);

  const groups = AISLES.map((a) => ({ aisle: a, items: items.filter((i) => i.aisle === a).sort((x, y) => x.name.localeCompare(y.name)) })).filter((g) => g.items.length);
  const left = items.filter((i) => !checked.has(i.id));

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
    const lines = [`Grocery list · ${plan?.name} · next 7 days`];
    for (const g of groups) {
      const todo = g.items.filter((i) => !checked.has(i.id));
      if (!todo.length) continue;
      lines.push('', g.aisle.toUpperCase());
      for (const i of todo) lines.push(`- ${i.name}${i.detail ? `, ${i.detail}` : ''}: ${i.qty}${i.hint ? ` (${i.hint})` : ''}`);
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
          <Button small kind="secondary" icon={I.upload} label="Share list" onPress={share} />
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
          {items.length - left.length} of {items.length} in the basket.
        </Txt>
      </Txt>
      {notice && (
        <Txt v="caption" color={c.accent} style={{ marginTop: 6, fontWeight: '700' }}>
          {notice}
        </Txt>
      )}

      {groups.length === 0 && (
        <Txt v="caption" dim={2} style={{ marginTop: space.xl }}>
          This plan has no meals yet.
        </Txt>
      )}

      {groups.map((g) => {
        const done = g.items.filter((i) => checked.has(i.id)).length;
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
                const on = checked.has(it.id);
                return (
                  <Pressable
                    key={it.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${it.name}${it.detail ? `, ${it.detail}` : ''}, ${it.qty}`}
                    onPress={() => toggle(it.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
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
                );
              })}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}
