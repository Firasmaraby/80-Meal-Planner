import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, Share, Switch, View } from 'react-native';

import { calorieTarget, macroTargets } from '@/engine/calc';
import { BOARD_KEYS, NUTRIENTS } from '@/engine/nutrients';
import type { Activity, Goal, LifeStage, Sex } from '@/engine/types';
import { isBackendConfigured, supabase } from '@/lib/supabase';
import { food } from '@/state/catalog';
import { useDay } from '@/state/day';
import { daysBetween, today, useStore } from '@/state/store';
import { useOpenNutrient } from '@/ui/panels';
import { Button, Card, Chip, Icon, I, IconButton, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';
import { NutrientTile } from '@/ui/viz';

const ACTIVITY: { key: Activity; label: string }[] = [
  { key: 'sedentary', label: 'Sedentary' },
  { key: 'light', label: 'Light' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'very', label: 'Very active' },
  { key: 'athlete', label: 'Athlete' },
];
const GOALS: { key: Goal; label: string }[] = [
  { key: 'lose', label: 'Lose fat' },
  { key: 'maintain', label: 'Maintain' },
  { key: 'gain', label: 'Build' },
];
const STAGES: { key: LifeStage; label: string }[] = [
  { key: 'none', label: 'Neither' },
  { key: 'pregnant', label: 'Pregnant' },
  { key: 'lactating', label: 'Breastfeeding' },
];
const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'gluten-free'];

/** Alert.alert is a no-op on web, so fall back to the browser's confirm. */
function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

const csvCell = (v: string | number | undefined) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function You() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const includeRare = useStore((s) => s.includeRare);
  const setIncludeRare = useStore((s) => s.setIncludeRare);
  const resetAll = useStore((s) => s.resetAll);
  const logs = useStore((s) => s.logs);
  const openNutrient = useOpenNutrient();
  const day = useDay(today());
  const [status, setStatus] = useState<string | null>(null);
  const email = useAuthEmail();

  const macros = macroTargets(profile, calorieTarget(profile));
  const weeks = daysBetween(profile.focusStartedAt ?? today(), today()) / 7;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const exportCsv = async () => {
    if (!logs.length) {
      setStatus('Nothing to export yet. Log a meal first.');
      return;
    }
    const keys = BOARD_KEYS;
    const head = ['date', 'time', 'meal', 'food_id', 'food', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'sat_fat_g', ...keys.map((k) => `${k}_${NUTRIENTS[k].unit}`)];
    const rows = [...logs]
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((l) => {
        const f = food(l.foodId);
        const per = (k: keyof NonNullable<typeof f>['n']) => {
          const v = f?.n[k];
          return v == null ? '' : Math.round(v * l.grams) / 100;
        };
        return [l.date, l.at.slice(11, 16), l.slot ?? '', l.foodId, f?.name ?? '', Math.round(l.grams), per('kcal'), per('protein'), per('carbs'), per('fat'), per('satFat'), ...keys.map((k) => per(k))]
          .map(csvCell)
          .join(',');
      });
    const csv = [head.join(','), ...rows].join('\n');
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `eighty-log-${today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: csv, title: `eighty-log-${today()}.csv` });
      }
      setStatus(`Exported ${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}.`);
    } catch {
      setStatus('Couldn’t share the file. Try again.');
    }
  };

  const reset = () =>
    confirmAction('Reset everything?', 'This clears your profile, log, favorites and saved plans on this device. It can’t be undone.', 'Reset', () => {
      resetAll();
      router.replace('/onboarding');
    });

  const signInStub = (provider: string) => {
    // TODO: wire Supabase auth (signInWithIdToken for Apple/Google, signInWithOtp for email).
    setStatus(`Sign in with ${provider} is coming soon. For now your data stays on this device.`);
  };

  const deleteAccount = () => {
    if (!supabase) return;
    if (!email) {
      notify('You’re not signed in', 'There’s no account to delete. Your data lives on this device only.');
      return;
    }
    const client = supabase;
    confirmAction('Delete your account?', 'This permanently deletes your account and everything synced to it. It can’t be undone.', 'Delete', async () => {
      const { error } = await client.rpc('delete_my_account');
      if (error) {
        setStatus(`Couldn’t delete the account: ${error.message}`);
        return;
      }
      await client.auth.signOut();
      setStatus('Account deleted. Data on this device stays until you reset it.');
    });
  };

  return (
    <Screen
      header={
        <View style={{ marginBottom: space.lg }}>
          <Txt v="label" dim={1}>
            You
          </Txt>
          <Txt v="title" style={{ marginTop: space.sm }}>
            Your profile
          </Txt>
          <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
            Targets are set from this. Change anything and your board updates straight away.
          </Txt>
        </View>
      }>
      <Card tone="accentSoft" style={{ gap: space.sm }}>
        <Txt v="label" color={c.accent}>
          Your daily targets
        </Txt>
        <Row style={{ justifyContent: 'space-between' }}>
          <Target value={macros.kcal.toLocaleString()} label="kcal" />
          <Target value={`${macros.protein}`} label="g protein" />
          <Target value={`${macros.satFatMax}`} label="g sat fat max" />
        </Row>
      </Card>

      <Section title="About you">
        <Card style={{ gap: space.lg }}>
          <Field label="Sex">
            <Row gap={6}>
              {(['female', 'male'] as Sex[]).map((s) => (
                <Chip
                  key={s}
                  label={s === 'female' ? 'Female' : 'Male'}
                  active={profile.sex === s}
                  onPress={() => setProfile({ sex: s, ...(s === 'male' ? { lifeStage: 'none' as LifeStage } : {}) })}
                />
              ))}
            </Row>
          </Field>
          <Field label="Age">
            <NumberStepper value={profile.age} min={14} max={100} step={1} unit="yrs" onChange={(age) => setProfile({ age })} />
          </Field>
          <Field label="Height">
            <NumberStepper value={profile.heightCm} min={120} max={220} step={1} unit="cm" onChange={(heightCm) => setProfile({ heightCm })} />
          </Field>
          <Field label="Weight">
            <NumberStepper value={profile.weightKg} min={35} max={250} step={1} unit="kg" onChange={(weightKg) => setProfile({ weightKg })} />
          </Field>
          <Field label="Activity" stacked>
            <ChipWrap>
              {ACTIVITY.map((a) => (
                <Chip key={a.key} label={a.label} active={profile.activity === a.key} onPress={() => setProfile({ activity: a.key })} />
              ))}
            </ChipWrap>
          </Field>
          <Field label="Goal" stacked>
            <ChipWrap>
              {GOALS.map((g) => (
                <Chip key={g.key} label={g.label} active={profile.goal === g.key} onPress={() => setProfile({ goal: g.key })} />
              ))}
            </ChipWrap>
          </Field>
          {profile.sex === 'female' && (
            <Field label="Pregnant or breastfeeding?" stacked>
              <ChipWrap>
                {STAGES.map((s) => (
                  <Chip key={s.key} label={s.label} active={profile.lifeStage === s.key} onPress={() => setProfile({ lifeStage: s.key })} />
                ))}
              </ChipWrap>
              <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
                Needs for several nutrients rise, so your targets will too.
              </Txt>
            </Field>
          )}
        </Card>
      </Section>

      <Section title="Protein and fat">
        <Card style={{ gap: space.lg }}>
          <Field label="Protein" stacked>
            <Row style={{ justifyContent: 'space-between' }}>
              <NumberStepper value={profile.proteinPerKg} min={0.8} max={2.4} step={0.1} decimals={1} unit="g/kg" onChange={(proteinPerKg) => setProfile({ proteinPerKg })} />
              {Math.abs(profile.proteinPerKg - 1.6) > 0.001 && (
                <Button kind="ghost" small label="Back to 1.6" onPress={() => setProfile({ proteinPerKg: 1.6 })} />
              )}
            </Row>
            <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
              1.6 g/kg is the high-protein baseline. At your weight that’s {Math.round(1.6 * profile.weightKg)} g a day; your setting is {macros.protein} g.
            </Txt>
          </Field>
          <Field label="Saturated fat ceiling" stacked>
            <NumberStepper value={profile.satFatPct} min={6} max={12} step={1} unit="% kcal" onChange={(satFatPct) => setProfile({ satFatPct })} />
            <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
              Default is 10%. That’s about {macros.satFatMax} g a day at your calorie target.
            </Txt>
          </Field>
        </Card>
      </Section>

      <Section title="Diet filters">
        <Card style={{ gap: space.sm }}>
          <ChipWrap>
            {DIETS.map((d) => {
              const on = profile.diet.includes(d);
              return (
                <Chip
                  key={d}
                  label={d}
                  active={on}
                  color={c.accent}
                  onPress={() => setProfile({ diet: on ? profile.diet.filter((x) => x !== d) : [...profile.diet, d] })}
                />
              );
            })}
          </ChipWrap>
          <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
            Used to shape plan suggestions and the foods we recommend.
          </Txt>
        </Card>
      </Section>

      <Section title="Focus 3">
        <Card style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="bodyStrong">Week {Math.min(6, Math.floor(weeks) + 1)} of 6</Txt>
            <Txt v="caption" dim={2}>
              {profile.lockedIn.length} locked in
            </Txt>
          </Row>
          <Row gap={space.md} style={{ justifyContent: 'center' }}>
            {profile.focus.map((k) => {
              const p = day.progress.find((x) => x.key === k);
              return (
                <NutrientTile key={k} k={k} pct={p?.pct ?? 0} noData={p?.amount == null} size={80} focus onPress={() => openNutrient(k)} />
              );
            })}
          </Row>
          <Button kind="secondary" label="Open my board" icon={I.board} onPress={() => router.push('/board')} />
        </Card>
      </Section>

      <Section title="Search">
        <Card>
          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong">Include rare foods in search</Txt>
              <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
                Organ meats, wild game, unusual produce.
              </Txt>
            </View>
            <Switch
              accessibilityLabel="Include rare foods in search"
              value={includeRare}
              onValueChange={(v) => {
                tap('select');
                setIncludeRare(v);
              }}
              trackColor={{ true: c.accent, false: c.line }}
              thumbColor="#FFFFFF"
            />
          </Row>
        </Card>
      </Section>

      <Section title="Data">
        <Card style={{ gap: space.sm }}>
          <Button kind="secondary" label="Export my log as CSV" icon={I.upload} onPress={exportCsv} />
          <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
            One row per food, with calories, macros and every board nutrient.
          </Txt>
          <Button kind="ghost" label="Reset everything" icon={I.trash} onPress={reset} />
        </Card>
        {status && (
          <Txt v="caption" dim={1} style={{ lineHeight: 18 }} accessibilityLiveRegion="polite">
            {status}
          </Txt>
        )}
      </Section>

      <Section title="Account">
        <Card style={{ gap: space.sm }}>
          {isBackendConfigured ? (
            <>
              {email ? (
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>
                    Signed in as {email}
                  </Txt>
                  <Button kind="secondary" small label="Sign out" onPress={() => supabase?.auth.signOut()} />
                </Row>
              ) : (
                <>
                  <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
                    An account will keep your log in sync across devices.
                  </Txt>
                  <Button kind="secondary" label="Continue with Apple" onPress={() => signInStub('Apple')} />
                  <Button kind="secondary" label="Continue with Google" onPress={() => signInStub('Google')} />
                  <Button kind="secondary" label="Continue with email" onPress={() => signInStub('email')} />
                  <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
                    Sign-in isn’t switched on yet. Your data stays on this device for now.
                  </Txt>
                </>
              )}
              <Button kind="ghost" label="Delete account" icon={I.trash} onPress={deleteAccount} />
            </>
          ) : (
            <Row gap={space.md}>
              <Icon name={I.lock} size={16} color={c.ink3} />
              <Txt v="body" dim={1} style={{ flex: 1 }}>
                Running offline. Your data stays on this device.
              </Txt>
            </Row>
          )}
        </Card>
      </Section>

      <Section title="For the team">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Plan admin"
          onPress={() => {
            tap('select');
            router.push('/admin');
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            padding: space.lg,
            borderRadius: radius.lg,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.line,
            opacity: pressed ? 0.8 : 1,
          })}>
          <Icon name={I.plans} size={18} color={c.ink2} />
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong">Plan admin</Txt>
            <Txt v="caption" dim={2}>
              Upload meal plans from the Excel template.
            </Txt>
          </View>
          <Icon name={I.chevron} size={13} color={c.ink3} />
        </Pressable>
      </Section>

      <Txt v="caption" dim={2} style={{ marginTop: space.xl, lineHeight: 18 }}>
        Eighty shares educational information, not medical advice. It isn’t a substitute for your doctor or a registered dietitian. Talk to them before
        changing your diet, especially if you’re pregnant, managing a condition or taking medication.
      </Txt>
      <Txt v="caption" dim={2} style={{ marginTop: space.md }}>
        Eighty · version {version}
      </Txt>
    </Screen>
  );
}

function useAuthEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setEmail(data.session?.user.email ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setEmail(session?.user.email ?? null));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return email;
}

function Target({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt v="numLg">{value}</Txt>
      <Txt v="caption" dim={1}>
        {label}
      </Txt>
    </View>
  );
}

function ChipWrap({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>;
}

function Field({ label, children, stacked }: { label: string; children: ReactNode; stacked?: boolean }) {
  return stacked ? (
    <View style={{ gap: space.sm }}>
      <Txt v="caption" dim={1} style={{ fontWeight: '700' }}>
        {label}
      </Txt>
      {children}
    </View>
  ) : (
    <Row style={{ justifyContent: 'space-between' }}>
      <Txt v="bodyStrong">{label}</Txt>
      {children}
    </Row>
  );
}

/** The shared Stepper rounds to whole numbers and has no upper bound; profile fields need both. */
function NumberStepper({
  value,
  min,
  max,
  step,
  decimals = 0,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => {
    const f = 10 ** decimals;
    onChange(Math.min(max, Math.max(min, Math.round(v * f) / f)));
  };
  return (
    <Row gap={space.sm}>
      <IconButton icon={I.minus} label={`Less ${unit}`} onPress={() => set(value - step)} />
      <Txt v="num" style={{ minWidth: 78, textAlign: 'center' }}>
        {value.toFixed(decimals)} {unit}
      </Txt>
      <IconButton icon={I.add} label={`More ${unit}`} onPress={() => set(value + step)} />
    </Row>
  );
}
