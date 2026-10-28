import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BAND_STEP, bandFor, bandLabel, calorieTarget, macroTargets } from '@/engine/calc';
import { BOARD_KEYS, NUTRIENTS } from '@/engine/nutrients';
import type { Activity, Goal, LifeStage, MealPlan, NutrientKey, Profile, Sex } from '@/engine/types';
import { useAllPlans } from '@/state/day';
import { useStore } from '@/state/store';
import { BAR_CLEARANCE, BottomBar, DIET_OPTIONS, Fingerprint, Pill, bandKey, dietMatches, planStats, tagLabel, useWho } from '@/ui/planParts';
import { Button, Card, Chip, Icon, I, Row, Screen, Txt, tap, type IconName } from '@/ui/primitives';
import { MAX_WIDTH, font, groupColor, radius, space, useTheme } from '@/ui/theme';
import { NutrientTile } from '@/ui/viz';

type StepId = 'welcome' | 'you' | 'activity' | 'diet' | 'focus' | 'numbers';
const STEPS: { id: StepId; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'you', label: 'About you' },
  { id: 'activity', label: 'Activity' },
  { id: 'diet', label: 'Diet' },
  { id: 'focus', label: 'Focus 3' },
  { id: 'numbers', label: 'Your numbers' },
];

const SUGGESTED_FOCUS: NutrientKey[] = ['vitC', 'iron', 'vitK'];
const FOCUS_CHOICES = BOARD_KEYS.filter((k) => k !== 'b7' && k !== 'iodine');

const ACTIVITIES: { key: Activity; label: string; desc: string }[] = [
  { key: 'sedentary', label: 'Sedentary', desc: 'Desk day, little planned exercise' },
  { key: 'light', label: 'Lightly active', desc: 'On your feet some, or 1–3 workouts a week' },
  { key: 'moderate', label: 'Moderately active', desc: '3–5 workouts a week' },
  { key: 'very', label: 'Very active', desc: 'Hard training most days, or a physical job' },
  { key: 'athlete', label: 'Athlete', desc: 'Twice-a-day training or a very heavy job' },
];
const GOALS: { key: Goal; label: string; desc: string }[] = [
  { key: 'lose', label: 'Lose fat', desc: 'A gentle deficit' },
  { key: 'maintain', label: 'Maintain', desc: 'Eat at your maintenance' },
  { key: 'gain', label: 'Build muscle', desc: 'A small surplus' },
];

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export default function Onboarding() {
  const c = useTheme();
  const stored = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const finishOnboarding = useStore((s) => s.finishOnboarding);
  const enroll = useStore((s) => s.enroll);

  const [step, setStep] = useState(0);
  const [sex, setSex] = useState<Sex>(stored.sex);
  const [age, setAge] = useState(stored.age);
  const [heightCm, setHeightCm] = useState(stored.heightCm);
  const [weightKg, setWeightKg] = useState(stored.weightKg);
  const [lifeStage, setLifeStage] = useState<LifeStage>(stored.lifeStage);
  const [activity, setActivity] = useState<Activity>(stored.activity);
  const [goal, setGoal] = useState<Goal>(stored.goal);
  const [diet, setDiet] = useState<string[]>(stored.diet);
  const [focus, setFocus] = useState<NutrientKey[]>(SUGGESTED_FOCUS);

  const id = STEPS[step].id;
  const last = step === STEPS.length - 1;

  const commit = () => {
    if (id === 'you') setProfile({ sex, age, heightCm, weightKg, lifeStage: sex === 'female' ? lifeStage : 'none' });
    if (id === 'activity') setProfile({ activity, goal });
    if (id === 'diet') setProfile({ diet });
    if (id === 'focus') setProfile({ focus });
  };
  const next = () => {
    commit();
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = (plan?: MealPlan) => {
    if (plan) enroll(plan);
    finishOnboarding();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen
        key={id}
        bottomInset={BAR_CLEARANCE}
        header={
          <View style={{ marginBottom: space.xl, gap: space.sm }}>
            <Row gap={6}>
              {STEPS.map((s, i) => (
                <View key={s.id} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? c.ink : c.surface2 }} />
              ))}
            </Row>
            <Txt v="label" dim={2}>
              {step + 1} of {STEPS.length} · {STEPS[step].label}
            </Txt>
          </View>
        }>
        <Animated.View entering={FadeInDown.duration(280)}>
          {id === 'welcome' && <Welcome />}
          {id === 'you' && (
            <AboutYou
              {...{ sex, setSex, age, setAge, heightCm, setHeightCm, weightKg, setWeightKg }}
              lifeStage={lifeStage}
              setLifeStage={setLifeStage}
            />
          )}
          {id === 'activity' && <ActivityGoal {...{ activity, setActivity, goal, setGoal }} pregnantOrNursing={sex === 'female' && lifeStage !== 'none'} />}
          {id === 'diet' && <Diet diet={diet} setDiet={setDiet} />}
          {id === 'focus' && <FocusPick focus={focus} setFocus={setFocus} />}
          {id === 'numbers' && <Numbers onStart={finish} />}
        </Animated.View>
      </Screen>

      <BottomBar>
        {id === 'welcome' ? (
          <Button label="Get started" icon={I.chevron} onPress={next} />
        ) : last ? (
          <Row gap={space.sm}>
            <Button kind="secondary" label="Back" icon={I.back} onPress={back} />
            <Button kind="ghost" label="I’ll choose later" style={{ flex: 1 }} onPress={() => finish()} />
          </Row>
        ) : (
          <Row gap={space.sm}>
            <Button kind="secondary" label="Back" icon={I.back} onPress={back} />
            <Button label="Continue" style={{ flex: 1 }} disabled={id === 'focus' && focus.length !== 3} onPress={next} />
          </Row>
        )}
      </BottomBar>
    </View>
  );
}

// ── 1 · Welcome ────────────────────────────────────────────────────────────

const DEMO: { k: NutrientKey; from: number; to: number }[] = [
  { k: 'vitC', from: 0.2, to: 0.96 },
  { k: 'iron', from: 0.12, to: 0.86 },
  { k: 'vitK', from: 0.3, to: 1 },
  { k: 'magnesium', from: 0.18, to: 0.9 },
  { k: 'folate', from: 0.1, to: 0.82 },
];

function Welcome() {
  const { width } = useWindowDimensions();
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 500);
    const loop = setInterval(() => setFilled((f) => !f), 2800);
    return () => {
      clearTimeout(t);
      clearInterval(loop);
    };
  }, []);
  const inner = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const size = Math.floor((inner - space.sm * (DEMO.length - 1)) / DEMO.length);
  return (
    <View style={{ paddingTop: space.xl }}>
      <Txt v="display" style={{ fontSize: 68, lineHeight: 76, letterSpacing: -2 }}>
        Eighty
      </Txt>
      <Txt v="h2" dim={1} style={{ marginTop: space.md, fontWeight: '500', lineHeight: 28 }}>
        Hit 80% of every vitamin and mineral, every day. The plan does the work.
      </Txt>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xxl }}>
        {DEMO.map((d) => (
          <NutrientTile key={d.k} k={d.k} pct={filled ? d.to : d.from} size={size} />
        ))}
      </View>
      <Txt v="caption" dim={2} style={{ marginTop: space.md }}>
        Each tile is done at 80%: the dashed line.
      </Txt>
      <Txt v="caption" dim={2} style={{ marginTop: space.xl }}>
        About a minute to set up.
      </Txt>
    </View>
  );
}

// ── Shared inputs ──────────────────────────────────────────────────────────

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Txt v="title">{title}</Txt>
      {sub ? (
        <Txt v="body" dim={1} style={{ marginTop: 4 }}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

/** A big selectable card. Ink border = chosen. */
function Choice({ label, desc, selected, onPress }: { label: string; desc?: string; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={desc ? `${label}. ${desc}` : label}
      onPress={() => {
        tap('select');
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? c.ink : c.line,
        backgroundColor: c.surface,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ flex: 1 }}>
        <Txt v="h3">{label}</Txt>
        {desc ? (
          <Txt v="caption" dim={1} style={{ marginTop: 2 }}>
            {desc}
          </Txt>
        ) : null}
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? c.ink : c.ink3,
          backgroundColor: selected ? c.ink : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {selected && <Icon name={I.check} size={11} color={c.bg} />}
      </View>
    </Pressable>
  );
}

function RoundBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={17} />
    </Pressable>
  );
}

/** Big −/+ stepper whose number is also typeable. */
function NumField({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; unit: string }) {
  const c = useTheme();
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const bump = (d: number) => onChange(clamp(round1(value + d), min, max));
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Txt v="label" dim={1}>
        {label}
      </Txt>
      <Row gap={space.sm}>
        <RoundBtn icon={I.minus} label={`Less ${label}`} onPress={() => bump(-step)} />
        <View
          style={{
            flex: 1,
            height: 52,
            borderRadius: radius.md,
            backgroundColor: c.surface,
            borderWidth: focused ? 2 : 1,
            borderColor: focused ? c.ink : c.line,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}>
          <TextInput
            accessibilityLabel={label}
            value={text}
            keyboardType="decimal-pad"
            selectTextOnFocus
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChangeText={(t) => {
              setText(t);
              const n = parseFloat(t.replace(',', '.'));
              if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
            }}
            style={{ minWidth: 40, maxWidth: 80, textAlign: 'center', fontSize: 22, fontWeight: '800', color: c.ink, fontFamily: font.rounded, padding: 0, outlineWidth: 0 }}
          />
          <Txt v="caption" dim={2}>
            {unit}
          </Txt>
        </View>
        <RoundBtn icon={I.add} label={`More ${label}`} onPress={() => bump(step)} />
      </Row>
    </View>
  );
}

function UnitToggle<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Row gap={6}>
      {options.map((o) => (
        <Chip key={o.key} label={o.label} active={value === o.key} onPress={() => onChange(o.key)} style={{ height: 28, paddingHorizontal: 12 }} />
      ))}
    </Row>
  );
}

// ── 2 · About you ──────────────────────────────────────────────────────────

function AboutYou(p: {
  sex: Sex;
  setSex: (s: Sex) => void;
  age: number;
  setAge: (n: number) => void;
  heightCm: number;
  setHeightCm: (n: number) => void;
  weightKg: number;
  setWeightKg: (n: number) => void;
  lifeStage: LifeStage;
  setLifeStage: (s: LifeStage) => void;
}) {
  const c = useTheme();
  const [hUnit, setHUnit] = useState<'cm' | 'ft'>('cm');
  const [wUnit, setWUnit] = useState<'kg' | 'lb'>('kg');
  const totalIn = Math.round(p.heightCm / CM_PER_IN);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  const lb = Math.round(p.weightKg / KG_PER_LB);

  return (
    <View>
      <Heading title="About you" sub="Your vitamin and mineral targets depend on these." />
      <Txt v="label" dim={1} style={{ marginBottom: 6 }}>
        Sex
      </Txt>
      <Row gap={space.sm}>
        {(['male', 'female'] as const).map((s) => (
          <View key={s} style={{ flex: 1 }}>
            <Choice label={s === 'male' ? 'Male' : 'Female'} selected={p.sex === s} onPress={() => p.setSex(s)} />
          </View>
        ))}
      </Row>

      {p.sex === 'female' && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Chip label="Neither" active={p.lifeStage === 'none'} onPress={() => p.setLifeStage('none')} />
            <Chip label="Pregnant" active={p.lifeStage === 'pregnant'} onPress={() => p.setLifeStage('pregnant')} />
            <Chip label="Breastfeeding" active={p.lifeStage === 'lactating'} onPress={() => p.setLifeStage('lactating')} />
          </Row>
          {p.lifeStage !== 'none' && (
            <Row gap={6}>
              <Icon name={I.info} size={14} color={c.ink2} />
              <Txt v="caption" dim={1} style={{ flex: 1 }}>
                We’ll use {p.lifeStage === 'pregnant' ? 'pregnancy' : 'breastfeeding'} targets and skip any calorie deficit.
              </Txt>
            </Row>
          )}
        </View>
      )}

      <View style={{ marginTop: space.xl }}>
        <NumField label="Age" value={p.age} onChange={p.setAge} min={14} max={90} unit="yrs" />
      </View>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="label" dim={1}>
            Height
          </Txt>
          <UnitToggle value={hUnit} onChange={setHUnit} options={[{ key: 'cm', label: 'cm' }, { key: 'ft', label: 'ft / in' }]} />
        </Row>
        {hUnit === 'cm' ? (
          <NumField label="Height" value={Math.round(p.heightCm)} onChange={p.setHeightCm} min={120} max={230} unit="cm" />
        ) : (
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <NumField label="Feet" value={ft} onChange={(f) => p.setHeightCm(Math.round((f * 12 + inch) * CM_PER_IN))} min={4} max={7} unit="ft" />
            <NumField label="Inches" value={inch} onChange={(i) => p.setHeightCm(Math.round((ft * 12 + i) * CM_PER_IN))} min={0} max={11} unit="in" />
          </Row>
        )}
      </View>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="label" dim={1}>
            Weight
          </Txt>
          <UnitToggle value={wUnit} onChange={setWUnit} options={[{ key: 'kg', label: 'kg' }, { key: 'lb', label: 'lb' }]} />
        </Row>
        {wUnit === 'kg' ? (
          <NumField label="Weight" value={round1(p.weightKg)} onChange={p.setWeightKg} min={35} max={250} unit="kg" />
        ) : (
          <NumField label="Weight" value={lb} onChange={(n) => p.setWeightKg(round1(n * KG_PER_LB))} min={77} max={550} unit="lb" />
        )}
      </View>
    </View>
  );
}

// ── 3 · Activity & goal ────────────────────────────────────────────────────

function ActivityGoal(p: { activity: Activity; setActivity: (a: Activity) => void; goal: Goal; setGoal: (g: Goal) => void; pregnantOrNursing: boolean }) {
  return (
    <View>
      <Heading title="How active are you?" />
      <View style={{ gap: space.sm }}>
        {ACTIVITIES.map((a) => (
          <Choice key={a.key} label={a.label} desc={a.desc} selected={p.activity === a.key} onPress={() => p.setActivity(a.key)} />
        ))}
      </View>
      <Txt v="title" style={{ marginTop: space.xxl, marginBottom: space.lg }}>
        What’s the goal?
      </Txt>
      <View style={{ gap: space.sm }}>
        {GOALS.map((g) => (
          <Choice key={g.key} label={g.label} desc={g.desc} selected={p.goal === g.key} onPress={() => p.setGoal(g.key)} />
        ))}
      </View>
      {p.pregnantOrNursing && (
        <Txt v="caption" dim={2} style={{ marginTop: space.md }}>
          While pregnant or breastfeeding we plan around maintenance plus the extra energy you need.
        </Txt>
      )}
    </View>
  );
}

// ── 4 · Diet ───────────────────────────────────────────────────────────────

function Diet({ diet, setDiet }: { diet: string[]; setDiet: (d: string[]) => void }) {
  return (
    <View>
      <Heading title="Any diet filters?" sub="Optional. Matching plans come first." />
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {DIET_OPTIONS.map((d) => (
          <Chip key={d.key} label={d.label} active={diet.includes(d.key)} onPress={() => setDiet(diet.includes(d.key) ? diet.filter((x) => x !== d.key) : [...diet, d.key])} style={{ height: 42, paddingHorizontal: 18 }} />
        ))}
      </Row>
      {diet.length === 0 && (
        <Txt v="caption" dim={2} style={{ marginTop: space.md }}>
          Eat everything? Just continue.
        </Txt>
      )}
    </View>
  );
}

// ── 5 · Focus 3 ────────────────────────────────────────────────────────────

const GROUPS: { title: string; keys: NutrientKey[] }[] = [
  { title: 'Vitamins', keys: FOCUS_CHOICES.filter((k) => NUTRIENTS[k].group === 'vitamin') },
  { title: 'Minerals', keys: FOCUS_CHOICES.filter((k) => NUTRIENTS[k].group === 'mineral') },
  { title: 'Fiber', keys: FOCUS_CHOICES.filter((k) => k === 'fiber') },
];

function FocusPick({ focus, setFocus }: { focus: NutrientKey[]; setFocus: (f: NutrientKey[]) => void }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [peek, setPeek] = useState<NutrientKey>(focus[0] ?? 'vitC');
  const cols = 5;
  const inner = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const size = Math.floor((inner - space.sm * (cols - 1)) / cols);
  const isSuggested = focus.length === 3 && SUGGESTED_FOCUS.every((k) => focus.includes(k));

  const toggle = (k: NutrientKey) => {
    setPeek(k);
    if (focus.includes(k)) setFocus(focus.filter((x) => x !== k));
    else setFocus([...focus, k].slice(-3)); // a fourth pick replaces the oldest
  };

  return (
    <View>
      <Heading title="Your Focus 3" sub="Start with three. Six weeks. Then add three more." />

      <Row gap={space.sm}>
        {[0, 1, 2].map((i) => {
          const k = focus[i];
          const g = k ? groupColor(c, k === 'fiber' ? 'fiber' : NUTRIENTS[k].group) : undefined;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={k ? `Remove ${NUTRIENTS[k].label}` : 'Empty slot. Pick a nutrient below'}
              disabled={!k}
              onPress={() => k && toggle(k)}
              style={{
                flex: 1,
                height: 60,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: g ? g.soft : 'transparent',
                borderWidth: g ? 0 : 1.5,
                borderStyle: g ? 'solid' : 'dashed',
                borderColor: c.ink3,
                paddingHorizontal: 4,
              }}>
              {k && g ? (
                <Txt v="caption" color={g.fg} numberOfLines={1} style={{ fontWeight: '800', textAlign: 'center' }}>
                  {NUTRIENTS[k].label.replace(/ \(.+\)/, '')}
                </Txt>
              ) : (
                <Txt v="caption" dim={2}>
                  Pick one
                </Txt>
              )}
            </Pressable>
          );
        })}
      </Row>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <Txt v="caption" dim={2}>
          {focus.length} of 3 picked
        </Txt>
        {!isSuggested && (
          <Pressable accessibilityRole="button" accessibilityLabel="Use the suggested start" onPress={() => setFocus(SUGGESTED_FOCUS)}>
            <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
              Use suggested start
            </Txt>
          </Pressable>
        )}
      </Row>

      <Card style={{ marginTop: space.md, padding: space.md }} tone="surface2">
        <Txt v="bodyStrong">{NUTRIENTS[peek].label}</Txt>
        <Txt v="caption" dim={1} style={{ marginTop: 2, lineHeight: 18 }}>
          {NUTRIENTS[peek].why}
        </Txt>
      </Card>

      {GROUPS.map((g) => (
        <View key={g.title} style={{ marginTop: space.xl, gap: space.sm }}>
          <Txt v="label" dim={1}>
            {g.title}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {g.keys.map((k) => (
              <PickTile key={k} k={k} size={size} on={focus.includes(k)} onPress={() => toggle(k)} />
            ))}
          </View>
        </View>
      ))}
      <Txt v="caption" dim={2} style={{ marginTop: space.lg }}>
        Vitamin C, iron and vitamin K are the suggested start.
      </Txt>
    </View>
  );
}

function PickTile({ k, size, on, onPress }: { k: NutrientKey; size: number; on: boolean; onPress: () => void }) {
  const c = useTheme();
  const g = groupColor(c, k === 'fiber' ? 'fiber' : NUTRIENTS[k].group);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={NUTRIENTS[k].label}
      onPress={() => {
        tap('select');
        onPress();
      }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? g.fg : g.soft,
        borderWidth: 1,
        borderColor: on ? g.fg : c.line,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Txt v="h3" color={on ? '#fff' : g.fg}>
        {NUTRIENTS[k].short}
      </Txt>
      {on && (
        <View style={{ position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={I.check} size={10} color={g.fg} />
        </View>
      )}
    </Pressable>
  );
}

// ── 6 · Your numbers ───────────────────────────────────────────────────────

function Numbers({ onStart }: { onStart: (plan: MealPlan) => void }) {
  const c = useTheme();
  const profile: Profile = useStore((s) => s.profile);
  const plans = useAllPlans();
  const who = useWho(profile);

  const kcal = useMemo(() => calorieTarget(profile), [profile]);
  const band = useMemo(() => bandFor(kcal), [kcal]);
  const protein = useMemo(() => macroTargets(profile, kcal).protein, [profile, kcal]);

  const { list, exact } = useMemo(() => {
    const dist = (p: MealPlan) => Math.abs(p.band.min - band.min);
    const byBand = (a: MealPlan, b: MealPlan) => dist(a) - dist(b) || a.name.localeCompare(b.name);
    const near = plans.filter((p) => dist(p) <= BAND_STEP).sort(byBand);
    const pool = near.length ? near : [...plans].sort(byBand).slice(0, 3);
    const matching = pool.filter((p) => dietMatches(p, profile.diet));
    return { list: matching.length || !profile.diet.length ? matching : pool, exact: matching.length > 0 || !profile.diet.length };
  }, [plans, band.min, profile.diet]);

  const stats = useMemo(() => new Map(list.map((p) => [p.id, planStats(p, who)])), [list, who]);

  return (
    <View>
      <Heading title="Your numbers" />
      <Card>
        <Txt v="label" dim={1}>
          Daily target
        </Txt>
        <Txt v="display" style={{ marginTop: 4 }}>
          {kcal.toLocaleString()}
          <Txt v="h3" dim={2}>
            {'  '}kcal
          </Txt>
        </Txt>
        <View style={{ height: 1, backgroundColor: c.line, marginVertical: space.md }} />
        <Row gap={space.xl}>
          <View>
            <Txt v="numLg" color={c.protein}>
              {protein}
              <Txt v="caption" dim={2}>
                {' '}g
              </Txt>
            </Txt>
            <Txt v="caption" dim={2}>
              protein a day
            </Txt>
          </View>
          <View>
            <Txt v="numLg">{bandLabel(band)}</Txt>
            <Txt v="caption" dim={2}>
              your plan band
            </Txt>
          </View>
        </Row>
      </Card>

      <Txt v="label" dim={1} style={{ marginTop: space.xl, marginBottom: space.sm }}>
        Plans for you
      </Txt>
      {!exact && (
        <Txt v="caption" dim={2} style={{ marginBottom: space.sm }}>
          No exact diet match yet. These are the closest.
        </Txt>
      )}
      {list.length === 0 ? (
        <Card>
          <Txt v="h3">No plans in your band yet</Txt>
          <Txt v="caption" dim={1} style={{ marginTop: 2 }}>
            Browse the full library from the Plans tab.
          </Txt>
        </Card>
      ) : (
        <View style={{ gap: space.md }}>
          {list.map((p) => {
            const st = stats.get(p.id)!;
            const same = bandKey(p.band) === bandKey(band);
            return (
              <Card key={p.id}>
                <Txt v="label" dim={2}>
                  {p.cuisine}
                </Txt>
                <Txt v="h2" style={{ marginTop: 2 }}>
                  {p.name}
                </Txt>
                <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
                  <Pill label={`${bandLabel(p.band)} kcal`} color={same ? c.bg : c.ink2} bg={same ? c.ink : c.surface2} />
                  {p.tags.slice(0, 3).map((t) => (
                    <Pill key={t} label={tagLabel(t)} />
                  ))}
                </Row>
                <Row gap={space.lg} style={{ marginTop: space.md }}>
                  <Fingerprint progress={st.progress} size={11} gap={3} />
                  <View style={{ flex: 1 }}>
                    <Txt v="h3">
                      {st.covered}/{st.of} covered
                    </Txt>
                    <Txt v="caption" dim={2}>
                      on an average day
                    </Txt>
                  </View>
                </Row>
                <Button label="Start this plan" icon={I.check} style={{ marginTop: space.md }} onPress={() => onStart(p)} />
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}
