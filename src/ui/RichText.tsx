/** Authored text with paragraph breaks and **bold** phrases, in the app's own type and theme. */
import { useMemo } from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';

import { parseRich } from '@/engine/richText';

import { Txt } from './primitives';
import { space } from './theme';

export { parseRich, plainText } from '@/engine/richText';

type TxtProps = Parameters<typeof Txt>[0];

/**
 * One <Txt> per paragraph, bold phrases as nested weight changes. Pass the same `v`, `dim`, `color` and `style` you
 * would give a plain <Txt>. Paragraphs are separated by `paragraphGap` (a small step, like the Cards that hold them).
 */
export function RichText({
  text,
  style,
  paragraphGap = space.sm,
  v,
  dim,
  color,
  ...rest
}: Omit<TxtProps, 'children' | 'style'> & { text: string | null | undefined; style?: StyleProp<TextStyle>; paragraphGap?: number }) {
  const paragraphs = useMemo(() => parseRich(text), [text]);
  if (!paragraphs.length) return null;
  return (
    <View style={{ gap: paragraphGap }}>
      {paragraphs.map((spans, i) => (
        <Txt key={i} v={v} dim={dim} color={color} style={style} {...rest}>
          {spans.map((s, j) =>
            s.bold ? (
              <Text key={j} style={{ fontWeight: '700' }}>
                {s.text}
              </Text>
            ) : (
              s.text
            ),
          )}
        </Txt>
      ))}
    </View>
  );
}
