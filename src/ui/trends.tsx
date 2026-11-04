/** Small charts for the report card: a line for a check-in rating or weight, and bars for Eighty days by month. */
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import type { TrendBucket } from '@/lib/insights';

import { Txt } from './primitives';
import { space, useTheme } from './theme';

const H = 72;
const PAD = 8;

/**
 * A line through the buckets that have a value. Buckets without one are skipped, not drawn as zero, so a weekly
 * check-in still reads as a line. `min` and `max` fix the scale (1 to 5 for ratings); otherwise it fits the data.
 */
export function TrendLine({ values, labels, label, min, max, color }: { values: (number | null)[]; labels: string[]; label: string; min?: number; max?: number; color?: string }) {
  const c = useTheme();
  const [w, setW] = useState(0);
  const pts = values.map((v, i) => (v == null ? null : { i, v })).filter((p): p is { i: number; v: number } => p != null);
  const lo = min ?? Math.min(...pts.map((p) => p.v));
  const hi = max ?? Math.max(...pts.map((p) => p.v));
  const span = hi - lo || 1;
  const n = values.length;
  const x = (i: number) => PAD + (n <= 1 ? 0 : (i / (n - 1)) * Math.max(0, w - PAD * 2));
  const y = (v: number) => (hi === lo ? H / 2 : PAD + (1 - (v - lo) / span) * (H - PAD * 2));
  const stroke = color ?? c.ink;
  // a few axis labels: first, middle and last
  const ticks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [...Array(n).keys()];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={H}>
            <Line x1={PAD} x2={w - PAD} y1={H - 1} y2={H - 1} stroke={c.line} strokeWidth={1} />
            {pts.length > 1 && (
              <Polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {pts.map((p, k) => (
              <Circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={k === pts.length - 1 ? 4.5 : 3} fill={k === pts.length - 1 ? stroke : c.surface} stroke={stroke} strokeWidth={2} />
            ))}
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        {ticks.map((t) => (
          <Txt key={t} v="caption" dim={2} style={{ fontSize: 11 }}>
            {labels[t]}
          </Txt>
        ))}
      </View>
    </View>
  );
}

/** Eighty days per month: a dark bar for Eighty days on top of a light one for days logged, against the days in the month. */
export function MonthBars({ buckets }: { buckets: TrendBucket[] }) {
  const c = useTheme();
  const total = buckets.reduce((s, b) => s + b.eightyDays, 0);
  const daysIn = (b: TrendBucket) => {
    const [y, m] = b.start.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };
  return (
    <View accessible accessibilityLabel={`${total} Eighty days in the last 12 months`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 64 }}>
        {buckets.map((b) => {
          const d = daysIn(b);
          return (
            <View key={b.start} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', borderRadius: 4, backgroundColor: c.surface2, overflow: 'hidden' }}>
              <View style={{ height: `${(b.loggedDays / d) * 100}%`, backgroundColor: c.accentSoft, justifyContent: 'flex-end' }}>
                <View style={{ height: b.loggedDays ? `${(b.eightyDays / b.loggedDays) * 100}%` : 0, backgroundColor: c.accent }} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: space.xs }}>
        {buckets.map((b) => (
          <Txt key={b.start} v="caption" dim={2} style={{ flex: 1, fontSize: 10, textAlign: 'center' }}>
            {b.label.slice(0, 1)}
          </Txt>
        ))}
      </View>
    </View>
  );
}
