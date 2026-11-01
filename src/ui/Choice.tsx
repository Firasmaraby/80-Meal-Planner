import { Pressable, View } from 'react-native';

import { Icon, I, Txt, tap } from './primitives';
import { radius, space, useTheme } from './theme';

/** A big selectable card. Ink border = chosen. */
export function Choice({ label, desc, selected, onPress }: { label: string; desc?: string; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={desc ? `${label}. ${desc}` : label}
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
      <View style={{ flex: 1 }}>
        <Txt v="h3">{label}</Txt>
        {desc ? (
          <Txt v="caption" dim={1} style={{ marginTop: 2 }}>
            {desc}
          </Txt>
        ) : null}
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

