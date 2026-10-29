import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Switch, View } from 'react-native';

import { healthStoreName, isHealthAvailable, requestHealthPermission } from '@/lib/health';
import { resetHealthSyncState, syncDates, syncTodayNow } from '@/lib/useHealthSync';
import { useHealthStore } from '@/state/healthStore';
import { addDays, today } from '@/state/store';
import { Button, Card, Icon, I, IconButton, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { space, useTheme } from '@/ui/theme';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/you'));

const formatWhen = (iso: string | null) => {
  if (!iso) return 'Not synced yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not synced yet';
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

export default function HealthSettings() {
  const c = useTheme();
  const isWeb = Platform.OS === 'web';
  const enabled = useHealthStore((s) => s.enabled);
  const setEnabled = useHealthStore((s) => s.setEnabled);
  const lastSyncedAt = useHealthStore((s) => s.lastSyncedAt);
  const lastError = useHealthStore((s) => s.lastError);
  const clearError = useHealthStore((s) => s.clearError);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (isWeb) return;
    let alive = true;
    isHealthAvailable().then((ok) => {
      if (alive) setAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, [isWeb]);

  const store = healthStoreName;

  /** Ask for permission; on success switch the export on and write the last two days. */
  const connect = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    clearError();
    try {
      const granted = await requestHealthPermission();
      if (!granted) {
        setEnabled(false);
        setNote(
          Platform.OS === 'ios'
            ? 'Eighty doesn’t have permission yet. Open Settings, Health, Data Access & Devices, Eighty and allow the nutrition types.'
            : 'Eighty doesn’t have permission yet. Open Health Connect, App permissions, Eighty and allow Nutrition.',
        );
        return;
      }
      setEnabled(true);
      resetHealthSyncState();
      const t = today();
      await syncDates([addDays(t, -1), t], { force: true });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (on: boolean) => {
    tap('select');
    if (on) void connect();
    else {
      setEnabled(false);
      setNote(null);
    }
  };

  const syncNow = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const ok = await syncTodayNow();
      if (ok) setNote('Today’s nutrition is up to date.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={
        <View style={{ marginBottom: space.lg }}>
          <Row gap={space.md}>
            <IconButton icon={I.back} label="Back" onPress={goBack} />
            <Txt v="label" dim={1}>
              {isWeb ? 'Health' : store}
            </Txt>
          </Row>
          <Txt v="title" style={{ marginTop: space.sm }}>
            Send meals to your health app
          </Txt>
        </View>
      }>
      <Card style={{ gap: space.sm }}>
        <Row gap={space.md}>
          <Icon name={I.heart} size={18} color={c.accent} />
          <Txt v="bodyStrong" style={{ flex: 1 }}>
            What’s shared
          </Txt>
        </Row>
        <Txt v="body" dim={1} style={{ lineHeight: 21 }}>
          Eighty only writes nutrition; it never reads your health data.
        </Txt>
        <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
          Each meal you log goes in as calories, protein, carbs, fat (total, saturated, mono- and polyunsaturated), fiber, sugar, sodium, and every vitamin and
          mineral {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} supports. Change or remove a log and the day is rewritten, so nothing is
          counted twice.
        </Txt>
      </Card>

      {isWeb ? (
        <Section title="Availability">
          <Card style={{ gap: space.sm }}>
            <Row gap={space.md}>
              <Icon name={I.info} size={16} color={c.ink3} />
              <Txt v="body" dim={1} style={{ flex: 1 }}>
                Health export is available in the Eighty iOS and Android apps.
              </Txt>
            </Row>
          </Card>
        </Section>
      ) : available === false ? (
        <Section title="Availability">
          <Card style={{ gap: space.sm }}>
            <Row gap={space.md}>
              <Icon name={I.info} size={16} color={c.warn} />
              <Txt v="body" dim={1} style={{ flex: 1 }}>
                {Platform.OS === 'ios'
                  ? 'Apple Health isn’t available on this device.'
                  : 'Health Connect isn’t installed or needs an update. Install or update it from the Play Store, then come back.'}
              </Txt>
            </Row>
          </Card>
        </Section>
      ) : (
        <>
          <Section title="Connection">
            <Card style={{ gap: space.lg }}>
              <Button
                kind={enabled ? 'done' : 'primary'}
                label={enabled ? `Connected to ${store}` : `Connect to ${store}`}
                icon={enabled ? I.check : I.heart}
                disabled={busy || available == null}
                onPress={connect}
              />
              <Row gap={space.md}>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">Send my meals</Txt>
                  <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
                    Today and yesterday stay in step as you log.
                  </Txt>
                </View>
                <Switch
                  accessibilityLabel={`Send my meals to ${store}`}
                  value={enabled}
                  disabled={busy || available == null}
                  onValueChange={toggle}
                  trackColor={{ true: c.accent, false: c.line }}
                  thumbColor="#FFFFFF"
                />
              </Row>
            </Card>
          </Section>

          <Section title="Sync">
            <Card style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="body" dim={1}>
                  Last sync
                </Txt>
                <Txt v="bodyStrong">{formatWhen(lastSyncedAt)}</Txt>
              </Row>
              <Button kind="secondary" label={busy ? 'Syncing…' : 'Sync today now'} icon={I.restore} disabled={!enabled || busy} onPress={syncNow} />
              {lastError && (
                <Txt v="caption" color={c.danger} style={{ lineHeight: 18 }} accessibilityLiveRegion="polite">
                  Last sync failed: {lastError}
                </Txt>
              )}
              {note && (
                <Txt v="caption" dim={1} style={{ lineHeight: 18 }} accessibilityLiveRegion="polite">
                  {note}
                </Txt>
              )}
            </Card>
          </Section>
        </>
      )}

      <Txt v="caption" dim={2} style={{ marginTop: space.xl, lineHeight: 18 }}>
        Choline and the individual omega-3 and omega-6 fats aren’t supported by {Platform.OS === 'android' ? 'Health Connect' : 'Apple Health'}, so they stay in
        Eighty. You can remove what Eighty wrote at any time from the {Platform.OS === 'ios' ? 'Health app' : 'Health Connect app'}.
      </Txt>
    </Screen>
  );
}
