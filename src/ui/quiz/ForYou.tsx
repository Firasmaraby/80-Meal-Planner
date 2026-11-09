import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { calorieTarget, macroTargets } from '@/engine/calc';
import { matchPlans } from '@/engine/match';
import { FOOD_INDEX } from '@/state/catalog';
import { useFamilies } from '@/state/families';
import { useStore } from '@/state/store';

import { Card, Icon, I, Row, Txt, tap } from '../primitives';
import { space, useTheme } from '../theme';

const retake = () => router.push({ pathname: '/onboarding', params: { retake: '1' } });
const openPlan = (id: string) => router.push({ pathname: '/plan/[id]', params: { id } });

/** The top of the Plans tab: matches from the quiz, or an invitation to take it. */
export function ForYou() {
  const c = useTheme();
  const quiz = useStore((s) => s.quiz);
  const profile = useStore((s) => s.profile);
  const enrollment = useStore((s) => s.enrollment);
  const families = useFamilies();
  const ranked = useMemo(
    () =>
      quiz
        ? matchPlans(
            families,
            {
              ...quiz,
              kcal: calorieTarget(profile),
              goal: profile.goal,
              proteinGoal: macroTargets(profile).protein,
              carbStyle: profile.carbStyle ?? 'whole',
              diet: profile.diet,
              lifeStage: profile.lifeStage,
            },
            FOOD_INDEX,
          ).ranked
        : [],
    [quiz, profile, families],
  );

  if (!quiz) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Find my plan in a minute" onPress={retake} style={({ pressed }) => ({ marginTop: space.md, opacity: pressed ? 0.85 : 1 })}>
        <Card style={{ paddingVertical: space.md }}>
          <Row gap={space.md}>
            <Icon name={I.spark} size={20} />
            <View style={{ flex: 1 }}>
              <Txt v="h3">Find my plan in a minute</Txt>
              <Txt v="caption" dim={1}>
                A few quick questions, then plans picked for you.
              </Txt>
            </View>
            <Icon name={I.chevron} size={16} color={c.ink3} />
          </Row>
        </Card>
      </Pressable>
    );
  }
  if (!ranked.length) return null;

  const surprise = () => {
    tap();
    const mine = (m: (typeof ranked)[number]) => m.family.sizes.some((p) => p.id === enrollment?.planId);
    const pool = ranked.slice(3, 13).filter((m) => !mine(m));
    const fallback = ranked.filter((m) => !mine(m));
    const list = pool.length ? pool : fallback;
    const m = list[Math.floor(Math.random() * list.length)];
    if (m) openPlan(m.pick.plan.id);
  };

  return (
    <View style={{ marginTop: space.md, gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label" dim={1}>
          For you
        </Txt>
        <Row gap={space.lg}>
          <Pressable accessibilityRole="button" accessibilityLabel="Surprise me" hitSlop={8} onPress={surprise}>
            <Txt v="caption" color={c.ink} style={{ fontWeight: '700' }}>
              Surprise me
            </Txt>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Retake the quiz" hitSlop={8} onPress={retake}>
            <Txt v="caption" color={c.ink} style={{ fontWeight: '700' }}>
              Retake the quiz
            </Txt>
          </Pressable>
        </Row>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
        {ranked.slice(0, 8).map((m) => (
          <Pressable
            key={m.family.id}
            accessibilityRole="button"
            accessibilityLabel={`${m.family.name}. ${m.why[0] ?? ''}`}
            onPress={() => openPlan(m.pick.plan.id)}
            style={({ pressed }) => ({ width: 210, opacity: pressed ? 0.85 : 1 })}>
            <Card style={{ height: 132, padding: space.md, justifyContent: 'space-between' }}>
              <View>
                <Txt v="label" dim={2} numberOfLines={1}>
                  {m.family.cuisine}
                </Txt>
                <Txt v="h3" numberOfLines={2} style={{ marginTop: 2 }}>
                  {m.family.name}
                </Txt>
              </View>
              {m.why[0] ? (
                <Txt v="caption" dim={1} numberOfLines={2}>
                  {m.why[0]}
                </Txt>
              ) : null}
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
