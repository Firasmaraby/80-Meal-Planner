import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';

import { kgToLb, lbToKg } from '@/lib/insights';
import { today } from '@/state/store';
import { useWellness, type Checkin, type Rating, type WeightUnit } from '@/state/wellnessStore';
import { Segmented } from '@/ui/planParts';
import { Button, Card, IconButton, I, Row, Screen, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

type Metric = 'energy' | 'sleep' | 'mood' | 'digestion';

const METRICS: { key: Metric; label: string; low: string; high: string }[] = [
  { key: 'energy', label: 'Energy', low: 'running on empty', high: 'firing on all cylinders' },
  { key: 'sleep', label: 'Sleep', low: 'tossing and turning', high: 'slept like a log' },
  { key: 'mood', label: 'Mood', low: 'weighed down', high: 'feeling great' },
  { key: 'digestion', label: 'Digestion', low: 'uncomfortable', high: 'smooth sailing' },
];

const RATINGS: Rating[] = [1, 2, 3, 4, 5];
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The week in four taps. Weight is optional; nothing here is graded. */
export default function CheckinScreen() {
  const c = useTheme();
  const date = today();
  const checkins = useWellness((s) => s.checkins);
  const unit = useWellness((s) => s.weightUnit);
  const setUnit = useWellness((s) => s.setWeightUnit);
  const addCheckin = useWellness((s) => s.addCheckin);

  const existing = checkins.find((x) => x.date === date);
  const lastWeightKg = [...checkins].reverse().find((x) => x.weightKg != null)?.weightKg;

  const [ratings, setRatings] = useState<Partial<Record<Metric, Rating>>>(() =>
    existing ? { energy: existing.energy, sleep: existing.sleep, mood: existing.mood, digestion: existing.digestion } : {},
  );
  const [weightText, setWeightText] = useState(() =>
    existing?.weightKg != null ? String(round1(unit === 'kg' ? existing.weightKg : kgToLb(existing.weightKg))) : '',
  );

  const weight = parseFloat(weightText.replace(',', '.'));
  const weightKg = Number.isFinite(weight) && weight > 0 ? round1(unit === 'kg' ? weight : lbToKg(weight)) : undefined;
  // a typo like 8 or 8000 shouldn't end up in the trend
  const weightOk = weightText.trim() === '' || (weightKg != null && weightKg >= 25 && weightKg <= 400);
  const complete = METRICS.every((m) => ratings[m.key] != null) && weightOk;

  const changeUnit = (u: WeightUnit) => {
    if (u === unit) return;
    if (weightKg != null) setWeightText(String(round1(u === 'kg' ? weightKg : kgToLb(weightKg))));
    setUnit(u);
  };

  const save = () => {
    if (!complete) return;
    Keyboard.dismiss();
    tap('success');
    const entry: Checkin = {
      date,
      energy: ratings.energy!,
      sleep: ratings.sleep!,
      mood: ratings.mood!,
      digestion: ratings.digestion!,
      ...(weightKg != null ? { weightKg } : {}),
    };
    addCheckin(entry);
    router.back();
  };

  const placeholder = lastWeightKg != null ? `Last: ${round1(unit === 'kg' ? lastWeightKg : kgToLb(lastWeightKg))}` : unit;

  return (
    <Screen
      bottomInset={40}
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
          <View style={{ flex: 1 }}>
            <Txt v="label" dim={1}>
              Check-in · about 20 seconds
            </Txt>
            <Txt v="title" style={{ marginTop: 2 }}>
              How has the week felt?
            </Txt>
          </View>
          <IconButton icon={I.close} label="Close" onPress={() => router.back()} />
        </Row>
      }>
      <View style={{ gap: space.lg }}>
        {METRICS.map((m) => (
          <RatingRow key={m.key} metric={m} value={ratings[m.key]} onChange={(v) => setRatings((r) => ({ ...r, [m.key]: v }))} />
        ))}
      </View>

      <Card style={{ marginTop: space.xl, gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt v="h3">Weight</Txt>
            <Txt v="caption" dim={2}>
              Optional. Only the trend matters.
            </Txt>
          </View>
          <View style={{ width: 120 }}>
            <Segmented<WeightUnit>
              options={[
                { key: 'kg', label: 'kg' },
                { key: 'lb', label: 'lb' },
              ]}
              value={unit}
              onChange={changeUnit}
            />
          </View>
        </Row>
        <TextInput
          value={weightText}
          onChangeText={setWeightText}
          placeholder={placeholder}
          placeholderTextColor={c.ink3}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          accessibilityLabel={`Weight in ${unit}, optional`}
          style={{
            height: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: weightOk ? c.line : c.danger,
            backgroundColor: c.bg,
            paddingHorizontal: space.md,
            color: c.ink,
            fontSize: 17,
            fontVariant: ['tabular-nums'],
            outlineStyle: 'none',
          } as never}
        />
        {!weightOk && (
          <Txt v="caption" color={c.danger}>
            That doesn’t look like a weight in {unit}. Clear it to skip.
          </Txt>
        )}
      </Card>

      <Button
        label={existing ? 'Update check-in' : 'Save check-in'}
        icon={I.check}
        disabled={!complete}
        onPress={save}
        style={{ marginTop: space.xl }}
      />
      <Txt v="caption" dim={2} style={{ marginTop: space.md, textAlign: 'center' }}>
        {complete ? 'Stays on your device. No right answers.' : 'Tap one number per row. No right answers.'}
      </Txt>
    </Screen>
  );
}

function RatingRow({ metric, value, onChange }: { metric: (typeof METRICS)[number]; value?: Rating; onChange: (r: Rating) => void }) {
  const c = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Txt v="h3">{metric.label}</Txt>
      <Row gap={space.sm}>
        {RATINGS.map((r) => {
          const on = value === r;
          return (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityLabel={`${metric.label} ${r} of 5`}
              accessibilityHint={r === 1 ? metric.low : r === 5 ? metric.high : undefined}
              accessibilityState={{ selected: on }}
              onPress={() => {
                tap('select');
                onChange(r);
              }}
              style={({ pressed }) => ({
                flex: 1,
                height: 48,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? c.ink : c.surface,
                borderWidth: 1,
                borderColor: on ? c.ink : c.line,
                opacity: pressed ? 0.75 : 1,
              })}>
              <Txt v="num" color={on ? c.bg : c.ink} style={{ fontSize: 17 }}>
                {r}
              </Txt>
            </Pressable>
          );
        })}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="caption" dim={2} style={{ flex: 1 }}>
          {metric.low}
        </Txt>
        <Txt v="caption" dim={2} style={{ flex: 1, textAlign: 'right' }}>
          {metric.high}
        </Txt>
      </Row>
    </View>
  );
}
