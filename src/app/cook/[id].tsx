import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { roundGrams } from '@/engine/calc';
import { findDurations, formatClock, householdMeasure, splitFoodName, splitSteps } from '@/lib/kitchen';
import { cancelTimerNotification, scheduleTimerNotification } from '@/lib/reminders';
import { food } from '@/state/catalog';
import { useDay } from '@/state/day';
import { useKitchen } from '@/state/kitchenStore';
import { today, useStore } from '@/state/store';
import { Button, Icon, I, IconButton, Row, Screen, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

type Timer = {
  total: number; // ms
  left: number; // ms, while paused or not started
  endAt: number | null; // set while running
  notif: string | null;
  done: boolean;
};

export default function Cook() {
  useKeepAwake();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { id, date: dateParam } = useLocalSearchParams<{ id: string; date?: string }>();
  const date = dateParam ?? today();
  const day = useDay(date);
  const dm = day.meals.find((m) => m.meal.id === id);
  const household = useKitchen((s) => s.householdSize);

  const steps = useMemo(() => splitSteps(dm?.meal.instructions), [dm?.meal.instructions]);
  const durations = useMemo(() => steps.map((s) => findDurations(s)), [steps]);
  const pages = steps.length + 2; // ingredients, each step, all done
  const [page, setPage] = useState(0);
  const [ticked, setTicked] = useState<Set<number>>(() => new Set());
  const [timers, setTimers] = useState<Record<string, Timer>>({});
  const [now, setNow] = useState(() => Date.now());
  const timersRef = useRef(timers);
  useEffect(() => {
    timersRef.current = timers;
  });

  // one ticker while anything is counting down; time comes from end stamps, so it stays right after the app was in the background
  const counting = Object.values(timers).some((t) => t.endAt !== null);
  useEffect(() => {
    if (!counting) return;
    const iv = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setTimers((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const k of Object.keys(prev)) {
          const x = prev[k];
          if (x.endAt !== null && x.endAt <= t) {
            next[k] = { ...x, endAt: null, left: 0, done: true, notif: null };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 250);
    return () => clearInterval(iv);
  }, [counting]);

  const finished = Object.values(timers).filter((t) => t.done).length;
  useEffect(() => {
    if (finished) tap('success');
  }, [finished]);

  const startTimer = async (key: string, seconds: number, step: number) => {
    const cur = timersRef.current[key];
    const left = cur && !cur.done && cur.left > 0 ? cur.left : seconds * 1000;
    const endAt = Date.now() + left;
    setNow(Date.now());
    setTimers((p) => ({ ...p, [key]: { total: seconds * 1000, left, endAt, notif: null, done: false } }));
    const notif = await scheduleTimerNotification(left / 1000, `Step ${step + 1} is ready${dm ? ` · ${dm.meal.name}` : ''}`);
    if (!notif) return;
    // still the same run? otherwise it was paused or reset while we waited
    if (timersRef.current[key]?.endAt === endAt) setTimers((p) => ({ ...p, [key]: { ...p[key], notif } }));
    else void cancelTimerNotification(notif);
  };
  const pauseTimer = (key: string) => {
    const t = timersRef.current[key];
    if (!t || t.endAt === null) return;
    void cancelTimerNotification(t.notif);
    setTimers((p) => ({ ...p, [key]: { ...t, left: Math.max(0, t.endAt! - Date.now()), endAt: null, notif: null } }));
  };
  const resetTimer = (key: string) => {
    const t = timersRef.current[key];
    if (!t) return;
    void cancelTimerNotification(t.notif);
    setTimers((p) => ({ ...p, [key]: { ...t, left: t.total, endAt: null, notif: null, done: false } }));
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!dm) {
    return (
      <Screen>
        <Txt v="h2">Meal not found</Txt>
        <Button label="Close" style={{ marginTop: space.lg }} onPress={close} />
      </Screen>
    );
  }

  const planId = dm.source === 'plan' ? day.plan?.id : undefined;
  const step = page - 1; // index into steps, when on a step page
  const last = page === pages - 1;
  const onSteps = page > 0 && !last;

  // timers running on a different step: a small way back to them
  const elsewhere = Object.entries(timers)
    .filter(([k, t]) => t.endAt !== null && Number(k.split(':')[0]) !== step)
    .map(([k, t]) => ({ key: k, step: Number(k.split(':')[0]), left: t.endAt! - now }));

  const go = (n: number) => {
    tap('select');
    setPage(Math.min(pages - 1, Math.max(0, n)));
  };

  return (
    <Screen scroll={false} contentStyle={{ flex: 1 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <IconButton icon={I.close} label="Close cook mode" onPress={close} />
        <Txt v="label" dim={1} accessibilityLiveRegion="polite">
          {page === 0 ? 'Ingredients' : last ? 'All done' : `Step ${page} of ${steps.length}`}
        </Txt>
        <View style={{ width: 34 }} />
      </Row>
      <View accessible accessibilityRole="progressbar" accessibilityLabel={`Page ${page + 1} of ${pages}`} style={{ flexDirection: 'row', gap: 4, marginBottom: space.lg }}>
        {Array.from({ length: pages }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= page ? c.ink : c.line }} />
        ))}
      </View>

      {elsewhere.length > 0 && (
        <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
          {elsewhere.map((e) => (
            <Pressable
              key={e.key}
              accessibilityRole="button"
              accessibilityLabel={`Timer running for step ${e.step + 1}, ${formatClock(e.left)} left. Go to that step`}
              onPress={() => go(e.step + 1)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: c.vitaminSoft }}>
              <Icon name={I.clock} size={14} color={c.vitamin} />
              <Txt v="caption" color={c.vitamin} style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                Step {e.step + 1} · {formatClock(e.left)}
              </Txt>
            </Pressable>
          ))}
        </Row>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
        {page === 0 && (
          <>
            <Txt v="display" style={{ fontSize: 30, lineHeight: 36 }}>
              {dm.meal.name}
            </Txt>
            <Txt v="body" dim={1} style={{ marginTop: 4, fontSize: 17, lineHeight: 24 }}>
              {[dm.meal.prepMinutes ? `${dm.meal.prepMinutes} min` : null, household > 1 ? `for ${household} people` : null].filter(Boolean).join(' · ') ||
                'Tick things off as you gather them.'}
            </Txt>
            <View style={{ marginTop: space.lg }}>
              {dm.ingredients.map((ing, i) => {
                const f = food(ing.foodId);
                const grams = roundGrams(ing.grams * household);
                const on = ticked.has(i);
                const { name, detail } = splitFoodName(f, ing.foodId);
                const hint = householdMeasure(f, grams);
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${name}${detail ? `, ${detail}` : ''}, ${grams} grams${hint ? `, ${hint}` : ''}`}
                    onPress={() => {
                      tap('select');
                      setTicked((s) => {
                        const n = new Set(s);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      });
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: on ? c.ink : c.ink3,
                        backgroundColor: on ? c.ink : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {on && <Icon name={I.check} size={17} color={c.bg} />}
                    </View>
                    <View style={{ flex: 1, opacity: on ? 0.45 : 1 }}>
                      <Txt v="h2" style={{ fontSize: 20, lineHeight: 26, textDecorationLine: on ? 'line-through' : 'none' }}>
                        {name}
                      </Txt>
                      {detail || ing.note ? (
                        <Txt v="body" dim={2}>
                          {[detail, ing.note].filter(Boolean).join(' · ')}
                        </Txt>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', opacity: on ? 0.45 : 1 }}>
                      <Txt v="num" style={{ fontSize: 20 }}>
                        {grams} g
                      </Txt>
                      {hint ? (
                        <Txt v="caption" dim={2} style={{ fontSize: 14 }}>
                          {hint}
                        </Txt>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {onSteps && (
          <>
            <Txt style={{ fontSize: 28, lineHeight: 38, fontWeight: '700', letterSpacing: -0.3 }}>{steps[step]}</Txt>
            {durations[step].map((d, j) => {
              const key = `${step}:${j}`;
              const t = timers[key];
              const left = t ? (t.endAt !== null ? Math.max(0, t.endAt - now) : t.left) : d.seconds * 1000;
              const running = !!t && t.endAt !== null;
              return (
                <View
                  key={key}
                  style={{ marginTop: space.xl, padding: space.lg, borderRadius: radius.lg, backgroundColor: t?.done ? c.accentSoft : c.surface, borderWidth: 1, borderColor: c.line, gap: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt v="label" dim={1}>
                      {t?.done ? 'Time’s up' : `${d.label} timer`}
                    </Txt>
                    {t && !running && (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Reset the ${d.label} timer`} hitSlop={10} onPress={() => resetTimer(key)}>
                        <Txt v="caption" dim={1} style={{ fontWeight: '700' }}>
                          Reset
                        </Txt>
                      </Pressable>
                    )}
                  </Row>
                  <Txt
                    accessibilityLabel={`${formatClock(left)} left`}
                    style={{ fontSize: 56, lineHeight: 62, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 }}
                    color={t?.done ? c.accent : c.ink}>
                    {formatClock(left)}
                  </Txt>
                  <BigButton
                    kind={running ? 'secondary' : 'primary'}
                    label={running ? 'Pause' : t?.done ? 'Start again' : t ? 'Resume' : `Start ${d.label} timer`}
                    onPress={() => {
                      if (running) pauseTimer(key);
                      else if (t?.done) {
                        resetTimer(key);
                        void startTimer(key, d.seconds, step);
                      } else void startTimer(key, d.seconds, step);
                    }}
                  />
                </View>
              );
            })}
          </>
        )}

        {last && (
          <View style={{ alignItems: 'center', paddingTop: space.xxl, gap: space.md }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={I.check} size={40} color={c.accent} />
            </View>
            <Txt v="display" style={{ textAlign: 'center' }}>
              {dm.eaten ? 'Already on your board' : 'Enjoy it'}
            </Txt>
            <Txt v="body" dim={1} style={{ textAlign: 'center', fontSize: 17, lineHeight: 24 }}>
              {dm.eaten ? `${dm.meal.name} is logged.` : `Done cooking ${dm.meal.name}? Log it and the board fills in.`}
            </Txt>
          </View>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: space.md, paddingTop: space.md, paddingBottom: insets.bottom + space.md }}>
        {page > 0 && <BigButton kind="secondary" label="Back" onPress={() => go(page - 1)} style={{ flex: 1 }} />}
        {!last ? (
          <BigButton kind="primary" label={page === 0 && steps.length ? 'Start cooking' : 'Next'} onPress={() => go(page + 1)} style={{ flex: 2 }} />
        ) : dm.eaten ? (
          <BigButton kind="primary" label="Done" onPress={close} style={{ flex: 2 }} />
        ) : (
          <BigButton
            kind="primary"
            label="Ate it"
            onPress={() => {
              tap('success');
              useStore.getState().logMeal(date, dm.meal, dm.ingredients, planId);
              close();
            }}
            style={{ flex: 2 }}
          />
        )}
      </View>
    </Screen>
  );
}

/** A thumb-sized button for use with messy hands. */
function BigButton({ label, onPress, kind, style }: { label: string; onPress: () => void; kind: 'primary' | 'secondary'; style?: object }) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.ink : c.surface2;
  const fg = kind === 'primary' ? c.bg : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        { height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, backgroundColor: bg, opacity: pressed ? 0.75 : 1 },
        style,
      ]}>
      <Txt color={fg} style={{ fontSize: 20, lineHeight: 26, fontWeight: '800' }}>
        {label}
      </Txt>
    </Pressable>
  );
}
