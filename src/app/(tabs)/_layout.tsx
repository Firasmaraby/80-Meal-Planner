import { NativeTabs } from 'expo-router/native-tabs';

import { I } from '@/ui/primitives';
import { useTheme } from '@/ui/theme';

export const TABS = [
  { name: 'index', label: 'Today', icon: I.today },
  { name: 'board', label: 'Board', icon: I.board },
  { name: 'plans', label: 'Plans', icon: I.plans },
  { name: 'learn', label: 'Learn', icon: I.learn },
  { name: 'you', label: 'You', icon: I.you },
] as const;

export default function TabsLayout() {
  const c = useTheme();
  return (
    <NativeTabs backgroundColor={c.surface} indicatorColor={c.accentSoft} tintColor={c.accent} labelStyle={{ selected: { color: c.ink } }}>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={t.icon.ios} md={t.icon.md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
