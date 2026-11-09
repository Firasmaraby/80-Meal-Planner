import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { BOARD_KEYS, COMPLETE_AT, NUTRIENTS } from '@/engine/nutrients';

import { Txt, tap } from '../primitives';
import { radius, useTheme } from '../theme';

const N = BOARD_KEYS.length;
const SHORT: Partial<Record<(typeof BOARD_KEYS)[number], string>> = { choline: 'Ch', fiber: 'Fib' };
/** The most a tile fills from answers alone: well short of 80%, which only the reveal reaches. */
const MAX_FILL = 0.75;

/** A steady 0..1 per tile, so the tiles fill at slightly different heights. */
const wobble = (i: number) => {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** What a tile holds for this much progress. Never reaches 80% until `complete`. */
export const tileFill = (i: number, progress: number) => Math.min(MAX_FILL, progress * MAX_FILL * (0.7 + 0.3 * wobble(i)));

function Tile({ i, progress, complete, size, h, label }: { i: number; progress: number; complete: boolean; size: number; h: number; label?: string }) {
  const c = useTheme();
  const fill = useSharedValue(0);
  const green = useSharedValue(0);
  const [ready, setReady] = useState(false);
  const done = complete && ready;
  useEffect(() => {
    if (complete) {
      const delay = 120 + i * 35;
      fill.value = withDelay(delay, withTiming(1, { duration: 420 }));
      green.value = withDelay(delay + 200, withTiming(1, { duration: 260 }));
      const t = setTimeout(() => setReady(true), delay + 260);
      return () => clearTimeout(t);
    }
    green.value = 0;
    fill.value = withTiming(tileFill(i, progress), { duration: 500 });
  }, [complete, progress, i, fill, green]);
  const fillStyle = useAnimatedStyle(() => ({ height: `${fill.value * 100}%` }));
  const greenStyle = useAnimatedStyle(() => ({ opacity: green.value }));
  return (
    <View
      style={{
        width: size,
        height: h,
        borderRadius: size > 30 ? radius.sm : 6,
        overflow: 'hidden',
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line,
        justifyContent: 'flex-end',
      }}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.ink, opacity: 0.2 }, fillStyle]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: c.accent }, greenStyle]} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 2, right: 2, bottom: `${COMPLETE_AT * 100}%`, borderTopWidth: 1, borderColor: done ? 'rgba(255,255,255,0.6)' : c.ink3, opacity: 0.7 }} />
      {label ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="caption" color={done ? '#fff' : c.ink2} style={{ fontSize: size < 30 ? 8.5 : 11, lineHeight: 13, fontWeight: '800' }} numberOfLines={1}>
            {label}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The 25 board tiles, filling a bit with each answer. `complete` is the reveal: every tile fills past 80% and turns
 * green (the accent), one after another. Green means "crossed 80%" and nothing else, so it is held back until then.
 */
export function LiveBoard({ progress, complete = false, cols = 9, labels = true, gap = 4, tileHeight }: { progress: number; complete?: boolean; cols?: number; labels?: boolean; gap?: number; tileHeight?: number }) {
  const [width, setWidth] = useState(0);
  const lastProgress = useRef(progress);
  useEffect(() => {
    if (progress > lastProgress.current && !complete) tap('select');
    lastProgress.current = progress;
  }, [progress, complete]);
  const size = width ? Math.floor((width - gap * (cols - 1)) / cols) : 0;
  const h = tileHeight ?? size;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {size > 0 &&
        BOARD_KEYS.map((k, i) => (
          <Tile key={k} i={i} progress={progress} complete={complete} size={size} h={h} label={labels ? (SHORT[k] ?? NUTRIENTS[k].short) : undefined} />
        ))}
    </View>
  );
}

export const BOARD_TILES = N;
