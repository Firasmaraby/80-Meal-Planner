import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bandFor, calorieTarget, macroTargets } from '@/engine/calc';
import {
  EMPTY_ANSWERS,
  REASONS,
  goalFromReasons,
  matchPlans,
  type Budget,
  type CookingFor,
  type FlavourGroup,
  type QuizAnswers,
  type QuizReason,
  type Taste,
  type WeeknightTime,
} from '@/engine/match';
import type { Activity, CarbStyle, Goal, LifeStage, MealPlan, NutrientKey, Profile, Sex } from '@/engine/types';
import { FOOD_INDEX } from '@/state/catalog';
import { useFamilies } from '@/state/families';
import { isEntitled } from '@/lib/paywall';
import { today, useStore } from '@/state/store';
import { CARB_QUESTION, CarbChoices } from '@/ui/carbParts';
import { Choice } from '@/ui/Choice';
import { BAR_CLEARANCE, BottomBar, DIET_OPTIONS } from '@/ui/planParts';
import { Button, Chip, Icon, I, Row, Screen, Txt, tap, type IconName } from '@/ui/primitives';
import { LiveBuilder } from '@/ui/quiz/LiveBuilder';
import { MatchReveal } from '@/ui/quiz/MatchReveal';
import { TasteTest } from '@/ui/quiz/TasteCard';
import { MAX_WIDTH, font, radius, space, useTheme } from '@/ui/theme';
import { NutrientTile } from '@/ui/viz';

type StepId = 'welcome' | 'reasons' | 'taste' | 'diet' | 'carbs' | 'time' | 'who' | 'budget' | 'you' | 'activity' | 'reveal';
const STEPS: StepId[] = ['welcome', 'reasons', 'taste', 'diet', 'carbs', 'time', 'who', 'budget', 'you', 'activity', 'reveal'];
const at = (id: StepId) => STEPS.indexOf(id);
/** the steps that show the live builder: reasons to activity */
const QUIZ_STEPS = at('activity') - at('reasons') + 1;
/** a tap on a single-choice answer moves on after this long, so the choice is seen */
const ADVANCE_MS = 260;

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

const TIMES: { key: WeeknightTime; label: string; desc: string }[] = [
  { key: 'quick', label: '15 minutes', desc: 'Fast and simple' },
  { key: 'medium', label: '30 minutes', desc: 'A little cooking is fine' },
  { key: 'love', label: 'I love to cook', desc: 'Happy to take my time' },
];
const WHO: { key: CookingFor; label: string; desc: string }[] = [
  { key: 'one', label: 'Just me', desc: 'Leftovers are welcome' },
  { key: 'two', label: 'Two of us', desc: 'Dinner for a pair' },
  { key: 'family', label: 'A family', desc: 'Big pots, happy plates' },
];
const BUDGETS: { key: Budget; label: string; desc: string }[] = [
  { key: 'cheap', label: 'Keep it cheap', desc: 'Pantry staples first' },
  { key: 'middle', label: 'Somewhere in the middle', desc: 'A bit of everything' },
  { key: 'treat', label: 'Treat me', desc: 'Good ingredients, why not' },
];

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

const inner = { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg } as const;

export default function Onboarding() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const isRetake = retake === '1';
  const stored = useStore((s) => s.profile);
  const storedQuiz = useStore((s) => s.quiz);
  const membership = useStore((s) => s.membership);
  const setProfile = useStore((s) => s.setProfile);
  const setQuiz = useStore((s) => s.setQuiz);
  const finishOnboarding = useStore((s) => s.finishOnboarding);
  const enroll = useStore((s) => s.enroll);
  const families = useFamilies();

  // a retake skips the welcome and starts from what the person said last time
  const [step, setStep] = useState(isRetake ? at('reasons') : 0);
  const [sex, setSex] = useState<Sex>(stored.sex);
  const [age, setAge] = useState(stored.age);
  const [heightCm, setHeightCm] = useState(stored.heightCm);
  const [weightKg, setWeightKg] = useState(stored.weightKg);
  const [lifeStage, setLifeStage] = useState<LifeStage>(stored.lifeStage);
  const [activity, setActivity] = useState<Activity>(stored.activity);
  const [goal, setGoal] = useState<Goal>(stored.goal);
  const [diet, setDiet] = useState<string[]>(stored.diet);
  const [carbStyle, setCarbStyle] = useState<CarbStyle>(stored.carbStyle ?? 'whole');
  const [carbPicked, setCarbPicked] = useState(!!storedQuiz?.carbStyle);
  const [reasons, setReasons] = useState<QuizReason[]>(storedQuiz?.reasons ?? []);
  const [tastes, setTastes] = useState<Partial<Record<FlavourGroup, Taste>>>(storedQuiz?.tastes ?? {});
  const [time, setTime] = useState<WeeknightTime | undefined>(storedQuiz?.time);
  const [cookingFor, setCookingFor] = useState<CookingFor | undefined>(storedQuiz?.cookingFor);
  const [budget, setBudget] = useState<Budget | undefined>(storedQuiz?.budget);

  const id = STEPS[step];
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => {
    if (step <= (isRetake ? at('reasons') : 0)) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    setStep((s) => s - 1);
  };

  // single-choice taps move on by themselves once the choice has been seen
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const advanceSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(next, ADVANCE_MS);
  };

  const profileNow: Profile = useMemo(
    () => ({ ...stored, sex, age, heightCm, weightKg, activity, goal, lifeStage: sex === 'female' ? lifeStage : 'none' }),
    [stored, sex, age, heightCm, weightKg, activity, goal, lifeStage],
  );
  const kcal = useMemo(() => calorieTarget(profileNow), [profileNow]);

  // what the person has told us so far; the body numbers only count once they are in
  const answers: QuizAnswers = useMemo(
    () => ({
      ...EMPTY_ANSWERS,
      reasons,
      tastes,
      diet: step >= at('diet') ? diet : [],
      carbStyle: carbPicked || step > at('carbs') ? carbStyle : undefined,
      time,
      cookingFor,
      budget,
      lifeStage: step > at('you') ? profileNow.lifeStage : undefined,
      kcal: step > at('you') ? kcal : undefined,
    }),
    [reasons, tastes, diet, carbStyle, carbPicked, time, cookingFor, budget, step, profileNow.lifeStage, kcal],
  );
  const live = useMemo(() => matchPlans(families, answers, FOOD_INDEX), [families, answers]);

  const finish = (plan?: MealPlan) => {
    setProfile({ sex, age, heightCm, weightKg, lifeStage: profileNow.lifeStage, activity, goal, diet, carbStyle });
    setQuiz(answers);
    if (plan) enroll(plan);
    finishOnboarding();
    // someone retaking the quiz already has access: skip the paywall
    if (isRetake && isEntitled(membership, today())) router.replace(plan ? '/' : '/plans');
    else router.replace('/paywall');
  };

  const pickReason = (r: QuizReason) =>
    setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r].slice(-2)));
  const continueFromReasons = () => {
    setGoal(goalFromReasons(reasons));
    next();
  };
  /** one tap: save the answer, then move on */
  const choose = <T,>(set: (v: T) => void, v: T, save?: () => void) => {
    set(v);
    save?.();
    advanceSoon();
  };

  const body = (
    <>
      {id === 'reasons' && <Reasons value={reasons} onPick={pickReason} />}
      {id === 'taste' && (
        <View>
          <Heading title="Taste test" sub="Would you eat this tonight?" />
          <TasteTest onChange={(g, t) => setTastes((x) => ({ ...x, [g]: t }))} onDone={next} />
        </View>
      )}
      {id === 'diet' && <Diet diet={diet} setDiet={setDiet} />}
      {id === 'carbs' && (
        <View>
          <Heading title={CARB_QUESTION} sub="We use this to pick plans that suit you. You can change it any time in You, Food preferences." />
          <CarbChoices
            value={carbStyle}
            onChange={(v) =>
              choose(
                setCarbStyle,
                v,
                () => {
                  setCarbPicked(true);
                  setProfile({ carbStyle: v });
                },
              )
            }
          />
        </View>
      )}
      {id === 'time' && (
        <Single title="Weeknight dinners?" sub="How long do you want to spend?" options={TIMES} value={time} onPick={(v) => choose(setTime, v)} />
      )}
      {id === 'who' && <Single title="Who are you cooking for?" options={WHO} value={cookingFor} onPick={(v) => choose(setCookingFor, v)} />}
      {id === 'budget' && <Single title="What about the grocery bill?" options={BUDGETS} value={budget} onPick={(v) => choose(setBudget, v)} />}
      {id === 'you' && (
        <AboutYou
          {...{ sex, setSex, age, setAge, heightCm, setHeightCm, weightKg, setWeightKg }}
          lifeStage={lifeStage}
          setLifeStage={setLifeStage}
        />
      )}
      {id === 'activity' && <ActivityGoal {...{ activity, setActivity, goal, setGoal }} pregnantOrNursing={sex === 'female' && lifeStage !== 'none'} />}
    </>
  );

  // multi-select and form steps keep a Continue button; single-choice steps and the taste test move on by themselves
  const needsContinue = id === 'reasons' || id === 'diet' || id === 'you' || id === 'activity';
  const onContinue = () => {
    if (id === 'reasons') return continueFromReasons();
    if (id === 'diet') setProfile({ diet });
    if (id === 'you') setProfile({ sex, age, heightCm, weightKg, lifeStage: profileNow.lifeStage });
    if (id === 'activity') setProfile({ activity, goal });
    next();
  };

  const progress = (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: c.surface2, overflow: 'hidden', marginBottom: space.lg }}>
      <ProgressFill fraction={step / (STEPS.length - 1)} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {id === 'welcome' || id === 'reveal' ? (
        <Screen bottomInset={BAR_CLEARANCE} key={id} header={<View style={{ marginBottom: space.sm }}>{progress}</View>}>
          {id === 'welcome' ? (
            <Welcome total={live.total} />
          ) : (
            <MatchReveal
              families={families}
              answers={answers}
              kcal={kcal}
              protein={macroTargets(profileNow, kcal).protein}
              band={bandFor(kcal)}
              onStart={finish}
            />
          )}
        </Screen>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + space.md }}>
          <View style={inner}>
            {progress}
            <LiveBuilder remaining={live.remaining} progress={(step - at('reasons') + 1) / (QUIZ_STEPS + 1)} answers={answers} />
          </View>
          <ScrollView key={id} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + BAR_CLEARANCE }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInDown.duration(280)} style={[inner, { paddingTop: space.xl }]}>
              {body}
            </Animated.View>
          </ScrollView>
        </View>
      )}

      <BottomBar>
        {id === 'welcome' ? (
          <Button label="Find my plan" icon={I.chevron} onPress={next} />
        ) : id === 'reveal' ? (
          <Row gap={space.sm}>
            <Button kind="secondary" label="Back" icon={I.back} onPress={back} />
            <Button kind="ghost" label="I’ll browse the plans myself" style={{ flex: 1 }} onPress={() => finish()} />
          </Row>
        ) : (
          <Row gap={space.sm}>
            <Button kind="secondary" label="Back" icon={I.back} onPress={back} style={needsContinue ? undefined : { flex: 1 }} />
            {needsContinue ? <Button label="Continue" style={{ flex: 1 }} onPress={onContinue} /> : null}
          </Row>
        )}
      </BottomBar>
    </View>
  );
}

/** The thin bar along the top: grows as the person moves through the quiz. */
function ProgressFill({ fraction }: { fraction: number }) {
  const c = useTheme();
  const w = useSharedValue(fraction);
  useEffect(() => {
    w.value = withTiming(fraction, { duration: 350 });
  }, [fraction, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: c.ink }, style]} />;
}

// ── Welcome ────────────────────────────────────────────────────────────────

const DEMO: { k: NutrientKey; from: number; to: number }[] = [
  { k: 'vitC', from: 0.2, to: 0.96 },
  { k: 'iron', from: 0.12, to: 0.86 },
  { k: 'vitK', from: 0.3, to: 1 },
  { k: 'magnesium', from: 0.18, to: 0.9 },
  { k: 'folate', from: 0.1, to: 0.82 },
];

function Welcome({ total }: { total: number }) {
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
  const innerW = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const size = Math.floor((innerW - space.sm * (DEMO.length - 1)) / DEMO.length);
  return (
    <View style={{ paddingTop: space.xl }}>
      <Txt v="display" style={{ fontSize: 68, lineHeight: 76, letterSpacing: -2 }}>
        Eighty
      </Txt>
      <Txt v="h2" dim={1} style={{ marginTop: space.md, fontWeight: '500', lineHeight: 28 }}>
        {`${total} plans. One is yours.`}
      </Txt>
      <Txt v="body" dim={1} style={{ marginTop: space.sm }}>
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
        A few quick questions and we’ll find it. About a minute.
      </Txt>
    </View>
  );
}

// ── New quiz steps ─────────────────────────────────────────────────────────

function Reasons({ value, onPick }: { value: QuizReason[]; onPick: (r: QuizReason) => void }) {
  return (
    <View>
      <Heading title="What brings you here?" sub="Pick up to two. Not sure? Just continue." />
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {REASONS.map((r) => (
          <Chip key={r.key} label={r.label} active={value.includes(r.key)} onPress={() => onPick(r.key)} style={{ height: 42, paddingHorizontal: 18 }} />
        ))}
      </Row>
    </View>
  );
}

/** One question, a few big cards. A tap picks and moves on. */
function Single<T extends string>({ title, sub, options, value, onPick }: { title: string; sub?: string; options: { key: T; label: string; desc?: string }[]; value?: T; onPick: (v: T) => void }) {
  return (
    <View>
      <Heading title={title} sub={sub} />
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ gap: space.sm }}>
        {options.map((o) => (
          <Choice key={o.key} label={o.label} desc={o.desc} selected={value === o.key} onPress={() => onPick(o.key)} />
        ))}
      </View>
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
