import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import {
  DEMO_PACKAGES,
  PRIVACY_URL,
  TERMS_URL,
  ctaLabel,
  legalLine,
  perMonthString,
  priceCaption,
  priceLine,
  savingsPct,
  shortDateOf,
  trialTimeline,
  type Package,
  type PackageId,
  type TimelineKey,
} from '@/lib/paywall';
import { IS_DEMO_PURCHASES, purchases } from '@/lib/purchases';
import { usePlan } from '@/state/day';
import { useFamilyOf } from '@/state/families';
import { useStore } from '@/state/store';
import { BAR_CLEARANCE, BottomBar } from '@/ui/planParts';
import { Button, Card, Icon, I, Row, Screen, Txt, tap, type IconName } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

const BENEFITS: { icon: IconName; title: string; sub: string }[] = [
  { icon: I.target, title: '80% of every vitamin and mineral', sub: 'Every day, worked out for you.' },
  { icon: I.flame, title: 'Plans sized to your body and goal', sub: 'Your calories, your foods.' },
  { icon: I.cart, title: 'Grocery lists and prep days', sub: 'Shop once, cook ahead.' },
  { icon: I.trend, title: 'Check-ins and a report card', sub: 'See how your weeks add up.' },
];

const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

const STEP_COPY: Record<TimelineKey, { label: (day: number) => string; text: string }> = {
  today: { label: () => 'Today', text: 'Full access starts' },
  reminder: {
    label: (d) => `Day ${d}`,
    text: platform === 'web' ? 'Your free week is almost over' : 'We’ll remind you',
  },
  charge: { label: (d) => `Day ${d}`, text: 'First charge. Cancel before then and you pay nothing' },
};

export default function Paywall() {
  const c = useTheme();
  const enrollment = useStore((s) => s.enrollment);
  const plan = usePlan(enrollment?.planId, enrollment?.version);
  const family = useFamilyOf(plan);
  const planName = plan ? (family?.name ?? plan.name) : undefined;

  const [packages, setPackages] = useState<Package[]>(DEMO_PACKAGES);
  const [selected, setSelected] = useState<PackageId>('annual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    purchases
      .getPackages()
      .then((p) => {
        if (alive && p.length) setPackages(p);
      })
      .catch(() => {
        /* keep the defaults */
      });
    return () => {
      alive = false;
    };
  }, []);

  const annual = packages.find((p) => p.id === 'annual');
  const monthly = packages.find((p) => p.id === 'monthly');
  const chosen = packages.find((p) => p.id === selected) ?? packages[0];
  const save = annual && monthly ? savingsPct(annual, monthly) : 0;
  const trialDays = chosen.trialDays;
  const timeline = useMemo(() => (trialDays ? trialTimeline(new Date(), trialDays) : []), [trialDays]);

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await purchases.purchase(chosen.id);
      if (res.ok) {
        router.replace('/');
        return;
      }
      if (!res.cancelled) setError(res.message);
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setBusy(false);
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await purchases.restore();
      if (res.restored) {
        router.replace('/');
        return;
      }
      setNote(res.message);
    } catch {
      setError('Couldn’t check your purchases. Please try again.');
    }
    setBusy(false);
  };

  const open = (url: string) => {
    tap('select');
    WebBrowser.openBrowserAsync(url).catch(() => {
      setError('Couldn’t open that page. Try again in a moment.');
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen bottomInset={BAR_CLEARANCE}>
        <View style={{ gap: space.sm, marginBottom: space.xl }}>
          <Txt v="display">{planName ? 'Your plan is ready' : 'Eat well without the math'}</Txt>
          {planName ? (
            <Txt v="h3" dim={1}>
              {planName}
            </Txt>
          ) : null}
          <Txt v="body" dim={1} style={{ lineHeight: 22 }}>
            Try everything free for a week. Keep going if it feels good.
          </Txt>
        </View>

        <View style={{ gap: space.md, marginBottom: space.xl }}>
          {BENEFITS.map((b) => (
            <Row key={b.title} gap={space.md} style={{ alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.sm,
                  backgroundColor: c.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name={b.icon} size={17} color={c.ink2} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{b.title}</Txt>
                <Txt v="caption" dim={1}>
                  {b.sub}
                </Txt>
              </View>
            </Row>
          ))}
        </View>

        <View accessibilityRole="radiogroup" style={{ gap: space.sm, marginBottom: space.xl }}>
          {annual && (
            <PlanOption
              title="Yearly"
              desc={`${priceLine(annual)} · ${perMonthString(annual)}`}
              badge={save > 0 ? `Save ${save}%` : undefined}
              selected={selected === 'annual'}
              onPress={() => setSelected('annual')}
            />
          )}
          {monthly && (
            <PlanOption title="Monthly" desc={priceLine(monthly)} selected={selected === 'monthly'} onPress={() => setSelected('monthly')} />
          )}
        </View>

        {timeline.length > 0 && (
          <Card style={{ gap: 0, marginBottom: space.xl }}>
            {timeline.map((step, i) => (
              <Row key={step.key} gap={space.md} style={{ alignItems: 'stretch' }}>
                <View style={{ alignItems: 'center', width: 14 }}>
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      marginTop: 4,
                      backgroundColor: i === 0 ? c.ink : c.surface,
                      borderWidth: 2,
                      borderColor: i === 0 ? c.ink : c.ink3,
                    }}
                  />
                  {i < timeline.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: c.line, marginVertical: 2 }} />}
                </View>
                <View style={{ flex: 1, paddingBottom: i < timeline.length - 1 ? space.lg : 0 }}>
                  <Txt v="label" dim={2}>
                    {STEP_COPY[step.key].label(step.day)} · {shortDateOf(step.date)}
                  </Txt>
                  <Txt v="bodyStrong">{STEP_COPY[step.key].text}</Txt>
                </View>
              </Row>
            ))}
          </Card>
        )}

        <View style={{ gap: space.sm, alignItems: 'center' }}>
          <Button kind="ghost" label="Restore purchases" onPress={restore} disabled={busy} />
          <Row gap={space.lg}>
            <Pressable accessibilityRole="link" accessibilityLabel="Terms" hitSlop={8} onPress={() => open(TERMS_URL)}>
              <Txt v="caption" dim={1} style={{ textDecorationLine: 'underline' }}>
                Terms
              </Txt>
            </Pressable>
            <Pressable accessibilityRole="link" accessibilityLabel="Privacy" hitSlop={8} onPress={() => open(PRIVACY_URL)}>
              <Txt v="caption" dim={1} style={{ textDecorationLine: 'underline' }}>
                Privacy
              </Txt>
            </Pressable>
          </Row>
          <Txt v="caption" dim={2} style={{ textAlign: 'center', lineHeight: 18 }}>
            {legalLine(chosen, platform)}
          </Txt>
          {IS_DEMO_PURCHASES && (
            <Txt v="caption" dim={2} style={{ textAlign: 'center' }}>
              Demo: no payment is taken.
            </Txt>
          )}
        </View>
      </Screen>

      <BottomBar>
        {(error || note) && (
          <Txt v="caption" color={error ? c.danger : undefined} dim={error ? undefined : 1} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
            {error ?? note}
          </Txt>
        )}
        <Button label={busy ? 'One moment…' : ctaLabel(chosen)} onPress={buy} disabled={busy} />
        <Txt v="caption" dim={1} style={{ textAlign: 'center' }}>
          {priceCaption(chosen)}
        </Txt>
      </BottomBar>
    </View>
  );
}

function PlanOption({
  title,
  desc,
  badge,
  selected,
  onPress,
}: {
  title: string;
  desc: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${desc}${badge ? `. ${badge}` : ''}`}
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
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={space.sm}>
          <Txt v="h3">{title}</Txt>
          {badge ? (
            <View style={{ paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: c.ink }}>
              <Txt v="label" color={c.bg}>
                {badge}
              </Txt>
            </View>
          ) : null}
        </Row>
        <Txt v="caption" dim={1}>
          {desc}
        </Txt>
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
