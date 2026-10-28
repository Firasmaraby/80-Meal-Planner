import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fetchPublishedPlans } from '@/lib/plansRepo';
import { isBackendConfigured } from '@/lib/supabase';
import { useStore } from '@/state/store';
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

function OnboardingGate() {
  const onboarded = useStore((s) => s.onboarded);
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    const inOnboarding = segments[0] === 'onboarding';
    const inAdmin = segments[0] === 'admin';
    if (!onboarded && !inOnboarding && !inAdmin) router.replace('/onboarding');
  }, [onboarded, segments, router]);
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="plan/[id]" />
            <Stack.Screen name="meal/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="log" options={{ presentation: 'modal' }} />
            <Stack.Screen name="food/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="nutrient/[key]" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }} />
            <Stack.Screen name="library/[key]" />
            <Stack.Screen name="learn" />
            <Stack.Screen name="grocery" />
            <Stack.Screen name="admin" />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
