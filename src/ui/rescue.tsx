import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { Icon, I, Row, Txt, tap } from './primitives';
import { space, useTheme } from './theme';

/**
 * A quiet way into "Life happened": you ate out, skipped a meal, or the day went sideways.
 * Meant for Today, under the meals. It stays a link, not a banner, so it never nags.
 */
export function RescueEntry({ date }: { date?: string }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Life happened? Re-plan today"
      hitSlop={8}
      onPress={() => {
        tap('select');
        router.push({ pathname: '/rescue', params: date ? { date } : {} });
      }}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1, paddingVertical: space.xs })}>
      <Row gap={space.sm}>
        <Icon name={I.restore} size={16} color={c.ink2} />
        <Txt v="caption" dim={1} style={{ fontWeight: '600' }}>
          Life happened? Re-plan today →
        </Txt>
      </Row>
    </Pressable>
  );
}
