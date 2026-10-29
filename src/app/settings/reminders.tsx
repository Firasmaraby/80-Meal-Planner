import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Switch, View } from 'react-native';

import { formatTime, stepTime, type ReminderSettings } from '@/lib/kitchen';
import { scheduleReminders, useReminderDays, type ScheduleResult } from '@/lib/reminders';
import { useKitchen } from '@/state/kitchenStore';
import { Button, Card, I, IconButton, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { space, useTheme } from '@/ui/theme';

const MEAL_ROWS = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'snack', label: 'Snack' },
  { slot: 'dinner', label: 'Dinner' },
] as const;

function message(r: ScheduleResult): { text: string; warn?: boolean } {
  switch (r.status) {
    case 'scheduled':
      return { text: `All set. ${r.count} ${r.count === 1 ? 'reminder is' : 'reminders are'} lined up.` };
    case 'off':
      return { text: 'Saved. Reminders are off.' };
    case 'denied':
      return { text: 'Saved, but notifications are blocked for Eighty. Allow them in Settings to get reminders.', warn: true };
    case 'unsupported':
      return { text: 'Saved. Reminders ring on the phone app.' };
    default:
      return { text: 'Saved, but we couldn’t set the reminders. Try again in a moment.', warn: true };
  }
}

export default function RemindersScreen() {
  const c = useTheme();
  const saved = useKitchen((s) => s.reminders);
  const setReminders = useKitchen((s) => s.setReminders);
  const days = useReminderDays();
  const [draft, setDraft] = useState<ReminderSettings>(saved);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScheduleResult | null>(null);

  const patch = (p: Partial<ReminderSettings>) => {
    setResult(null);
    setDraft((d) => ({ ...d, ...p }));
  };
  const setMealTime = (slot: (typeof MEAL_ROWS)[number]['slot'], t: string) => patch({ mealTimes: { ...draft.mealTimes, [slot]: t } });

  const save = async () => {
    setBusy(true);
    setReminders(draft);
    const r = await scheduleReminders(draft, days, { ask: true });
    setResult(r);
    setBusy(false);
    if (r.status === 'scheduled') tap('success');
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const msg = result ? message(result) : null;

  return (
    <Screen bottomInset={40} header={<IconButton icon={I.back} label="Back" onPress={back} />}>
      <Txt v="title" style={{ marginTop: space.md }}>
        Reminders
      </Txt>
      <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
        Gentle nudges on your phone. Pick only the ones that help.
      </Txt>
      {Platform.OS === 'web' && (
        <Card style={{ marginTop: space.lg }}>
          <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
            Reminders ring on the phone app. You can still set them up here.
          </Txt>
        </Card>
      )}

      <Section title="Meals">
        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow
            title="Meal times"
            note="A nudge at each meal, with what’s on the menu."
            value={draft.meals}
            onChange={(v) => patch({ meals: v })}
          />
          {draft.meals &&
            MEAL_ROWS.map((m) => (
              <TimeRow key={m.slot} label={m.label} value={draft.mealTimes[m.slot]} onChange={(t) => setMealTime(m.slot, t)} />
            ))}
        </Card>
      </Section>

      <Section title="Prep">
        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow
            title="Night-before prep"
            note="The evening before a meal that needs beans or grains cooked ahead."
            value={draft.prepEvening}
            onChange={(v) => patch({ prepEvening: v })}
          />
          {draft.prepEvening && <TimeRow label="Remind me at" value={draft.prepTime} onChange={(t) => patch({ prepTime: t })} />}
        </Card>
      </Section>

      <Section title="Evening">
        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow
            title="Evening check"
            note="A look at what’s left on your board today."
            value={draft.eveningCheck}
            onChange={(v) => patch({ eveningCheck: v })}
          />
          {draft.eveningCheck && <TimeRow label="Remind me at" value={draft.eveningTime} onChange={(t) => patch({ eveningTime: t })} />}
        </Card>
      </Section>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Button label={busy ? 'Saving…' : 'Save reminders'} icon={I.check} disabled={busy} onPress={save} />
        {msg && (
          <Txt v="caption" color={msg.warn ? c.warn : c.accent} style={{ fontWeight: '700', lineHeight: 18 }} accessibilityLiveRegion="polite">
            {msg.text}
          </Txt>
        )}
        {result?.status === 'denied' && Platform.OS !== 'web' && (
          <Button kind="secondary" label="Open Settings" onPress={() => void Linking.openSettings()} />
        )}
      </View>
    </Screen>
  );
}

function ToggleRow({ title, note, value, onChange }: { title: string; note: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useTheme();
  return (
    <Row gap={space.md} style={{ paddingVertical: space.md }}>
      <View style={{ flex: 1 }}>
        <Txt v="bodyStrong">{title}</Txt>
        <Txt v="caption" dim={2} style={{ lineHeight: 17 }}>
          {note}
        </Txt>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={(v) => {
          tap('select');
          onChange(v);
        }}
        trackColor={{ false: c.line, true: c.accent }}
      />
    </Row>
  );
}

/** Hour and minute steppers (no date-picker dependency). Hours step by 1, minutes by 5. */
function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  const c = useTheme();
  return (
    <View style={{ paddingVertical: space.md, borderTopWidth: 1, borderTopColor: c.line, gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="bodyStrong">{label}</Txt>
        <Txt v="num" style={{ fontSize: 17 }} accessibilityLabel={`${label} at ${formatTime(value)}`}>
          {formatTime(value)}
        </Txt>
      </Row>
      <Row style={{ justifyContent: 'flex-end' }} gap={space.xl}>
        <Row gap={space.sm}>
          <Txt v="caption" dim={2}>
            Hour
          </Txt>
          <IconButton icon={I.minus} label={`${label}: earlier by an hour`} onPress={() => onChange(stepTime(value, -1, 0))} />
          <IconButton icon={I.add} label={`${label}: later by an hour`} onPress={() => onChange(stepTime(value, 1, 0))} />
        </Row>
        <Row gap={space.sm}>
          <Txt v="caption" dim={2}>
            Min
          </Txt>
          <IconButton icon={I.minus} label={`${label}: 5 minutes earlier`} onPress={() => onChange(stepTime(value, 0, -5))} />
          <IconButton icon={I.add} label={`${label}: 5 minutes later`} onPress={() => onChange(stepTime(value, 0, 5))} />
        </Row>
      </Row>
    </View>
  );
}
