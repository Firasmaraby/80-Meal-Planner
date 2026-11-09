import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Txt } from '../primitives';
import { font } from '../theme';

/** A whole number that rolls to its new value (about 400ms, eased out). */
export function useRolling(target: number, ms = 400, start = target): number {
  const [shown, setShown] = useState(start);
  const cur = useRef(start);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      cur.current = from + (target - from) * eased;
      setShown(Math.round(cur.current));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

/** "104" counting down to how many plans are still in the running. */
export function PlanCounter({ value, from, size = 46, ms = 400, label = 'plans still in the running' }: { value: number; from?: number; size?: number; ms?: number; label?: string }) {
  const shown = useRolling(value, ms, from ?? value);
  const bump = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    bump.value = withSequence(withTiming(1.1, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 200 }));
  }, [value, bump]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${value} ${label}`}>
      <Animated.View style={[{ alignSelf: 'flex-start', transformOrigin: 'left center' }, style]}>
        <Txt style={{ fontSize: size, lineHeight: size + 4, fontWeight: '800', letterSpacing: -1.5, fontFamily: font.rounded, fontVariant: ['tabular-nums'] }}>{shown}</Txt>
      </Animated.View>
      <Txt v="caption" dim={1} style={{ marginTop: 2 }}>
        {label}
      </Txt>
    </View>
  );
}
