import { Tabs } from 'expo-router';

import { Icon, I } from '@/ui/primitives';
import { font, useTheme } from '@/ui/theme';

const TABS = [
  { name: 'index', label: 'Today', icon: I.today },
  { name: 'board', label: 'Board', icon: I.board },
  { name: 'plans', label: 'Plans', icon: I.plans },
  { name: 'meals', label: 'Meals', icon: I.meals },
  { name: 'you', label: 'You', icon: I.you },
] as const;

/** Web preview: a phone-style bottom tab bar so the layout matches the native app. */
export default function WebTabs() {
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.ink3,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11, fontFamily: font.sans },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.label, tabBarIcon: ({ color }) => <Icon name={t.icon} size={22} color={String(color)} /> }}
        />
      ))}
    </Tabs>
  );
}
