import { router } from 'expo-router';
import { View } from 'react-native';

import { isCheckinDue } from '@/lib/insights';
import { today } from '@/state/store';
import { useWellness } from '@/state/wellnessStore';

import { Button, Card, Icon, I, Row, Txt } from './primitives';
import { space, useTheme } from './theme';

/**
 * Shows on Today when it has been a week since the last check-in (or there has never been one).
 * Four taps, under twenty seconds. "Not today" tucks it away until tomorrow, no questions asked.
 */
export function CheckinPromptCard() {
  const c = useTheme();
  const checkins = useWellness((s) => s.checkins);
  const snoozedOn = useWellness((s) => s.promptSnoozedOn);
  const snooze = useWellness((s) => s.snoozeCheckinPrompt);
  const now = today();

  if (!isCheckinDue(checkins, now) || snoozedOn === now) return null;
  const first = checkins.length === 0;

  return (
    <Card>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={I.heart} size={17} color={c.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">{first ? 'How are you feeling?' : 'Weekly check-in'}</Txt>
          <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
            {first
              ? 'Four quick taps on energy, sleep, mood and digestion. Over time it shows how you feel alongside what you eat.'
              : 'It has been a week. Four quick taps on energy, sleep, mood and digestion.'}
          </Txt>
        </View>
      </Row>
      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Button small label="Check in" icon={I.check} onPress={() => router.push('/checkin')} />
        <Button small kind="ghost" label="Not today" onPress={() => snooze(now)} />
      </Row>
    </Card>
  );
}
