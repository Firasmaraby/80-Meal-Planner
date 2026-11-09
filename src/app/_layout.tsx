import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fetchPublishedPlans } from '@/lib/plansRepo';
import { isEntitled } from '@/lib/paywall';
import { useReminderSync } from '@/lib/reminders';
import { useHealthSync } from '@/lib/useHealthSync';
import { isBackendConfigured } from '@/lib/supabase';
import { today, useStore } from '@/state/store';
import { palettes } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

function useHydrated() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useStore.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}

/** Background jobs that follow the user's data: local reminders and health-app export. */
function BackgroundSync() {
  useReminderSync();
  useHealthSync();
  return null;
}

function OnboardingGate() {
  const onboarded = useStore((s) => s.onboarded);
  const membership = useStore((s) => s.membership);
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    const first = segments[0] as string | undefined;
    if (first === 'admin') return;
    if (!onboarded) {
      if (first !== 'onboarding') router.replace('/onboarding');
      return;
    }
    // hard paywall: the app opens once the free week has started
    if (first !== 'paywall' && first !== 'onboarding' && !isEntitled(membership, today())) router.replace('/paywall');
  }, [onboarded, membership, segments, router]);
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = palettes[scheme];
  const hydrated = useHydrated();
  const setRemotePlans = useStore((s) => s.setRemotePlans);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  useEffect(() => {
    if (!isBackendConfigured) return;
    fetchPublishedPlans()
      .then(setRemotePlans)
      .catch(() => {
        /* offline: keep bundled + cached plans */
      });
  }, [setRemotePlans]);

  const nav = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...nav, colors: { ...nav.colors, background: c.bg, card: c.surface, text: c.ink, border: c.line, primary: c.accent } };

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          <OnboardingGate />
          <BackgroundSync />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
            <Stack.Screen name="plan/[id]" />
            <Stack.Screen name="meal/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="log" options={{ presentation: 'modal' }} />
            <Stack.Screen name="food/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="nutrient/[key]" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }} />
            <Stack.Screen name="library/[key]" />
            <Stack.Screen name="learn" />
            <Stack.Screen name="grocery" />
            <Stack.Screen name="rescue" options={{ presentation: 'modal' }} />
            <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
            <Stack.Screen name="report" />
            <Stack.Screen name="supplements" />
            <Stack.Screen name="settings/food" />
            <Stack.Screen name="cook/[id]" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="settings/reminders" />
            <Stack.Screen name="admin" />
            <Stack.Screen name="settings/health" />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
