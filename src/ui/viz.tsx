import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

import { COMPLETE_AT, NUTRIENTS } from '@/engine/nutrients';
import type { NutrientKey } from '@/engine/types';

import { Icon, I, Row, Txt, tap } from './primitives';
import { groupColor, radius, space, useTheme } from './theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const fmtPct = (pct: number) => `${Math.round(pct * 100)}%`;

export function fmtAmount(v: number | undefined, unit: string) {
  if (v == null) return '—';
  const n = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return `${n.toLocaleString()} ${unit}`;
}

// ── Ring ───────────────────────────────────────────────────────────────────

/**
 * Circular progress with a tick at 80%: the finish line.
 * `ghost` draws the plan projection (what you'll have if you finish today's plan).
 */
export function Ring({
  value,
  ghost,
  size = 120,
  stroke = 12,
  color,
  children,
  tick = true,
}: {
  value: number; // 0..1+ of full RDA/target
  ghost?: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  tick?: boolean;
}) {
  const c = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(Math.min(value, 1), { duration: 700 });
  }, [value, p]);
  const animated = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p.value) }));
  const ghostLen = Math.min(ghost ?? 0, 1);
  const tickAngle = COMPLETE_AT * 2 * Math.PI - Math.PI / 2;
  const cx = size / 2;
  const fg = color ?? (value >= COMPLETE_AT ? c.accent : c.ink);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cx} r={r} stroke={c.surface2} strokeWidth={stroke} fill="none" />
        {ghostLen > 0 && (
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={fg}
            strokeOpacity={0.18}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - ghostLen)}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        )}
        <AnimatedCircle
          cx={cx}
          cy={cx}
          r={r}
          stroke={fg}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          animatedProps={animated}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
        {tick && (
          <Line
            x1={cx + (r - stroke / 2 - 2) * Math.cos(tickAngle)}
            y1={cx + (r - stroke / 2 - 2) * Math.sin(tickAngle)}
            x2={cx + (r + stroke / 2 + 2) * Math.cos(tickAngle)}
            y2={cx + (r + stroke / 2 + 2) * Math.sin(tickAngle)}
            stroke={c.ink}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

// ── Nutrient tile ──────────────────────────────────────────────────────────

/**
 * A board tile. Liquid rises from the bottom as you eat; the dashed line is 80%.
 * Crossing it turns the tile solid with a check. The tile fills to the top at 100%,
 * but 80% is what counts. Projection from the rest of today's plan shows as a pale band.
 */
export function NutrientTile({
  k,
  pct,
  ghost,
  noData,
  focus,
  size = 64,
  onPress,
}: {
  k: NutrientKey;
  pct: number;
  ghost?: number;
  noData?: boolean;
  focus?: boolean;
  size?: number;
  onPress?: () => void;
}) {
  const c = useTheme();
  const info = NUTRIENTS[k];
  const g = groupColor(c, k === 'fiber' ? 'fiber' : info.group);
  const done = pct >= COMPLETE_AT;
  const fill = useSharedValue(0);
  const pop = useSharedValue(1);
  useEffect(() => {
    fill.value = withTiming(Math.min(pct, 1), { duration: 650 });
    if (done) pop.value = withSpring(1, { damping: 6, stiffness: 220 }, () => {});
  }, [pct, done, fill, pop]);
  const fillStyle = useAnimatedStyle(() => ({ height: `${fill.value * 100}%` }));
  const ghostH = Math.min(Math.max(ghost ?? 0, pct), 1);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${info.label}: ${noData ? 'no data' : `${fmtPct(pct)} of daily target`}${done ? ', complete' : ''}`}
      onPress={() => {
        tap('select');
        onPress?.();
      }}
      style={({ pressed }) => [
        tile.base,
        {
          width: size,
          height: size,
          backgroundColor: c.surface,
          borderColor: focus ? c.ink : c.line,
          borderWidth: focus ? 2 : 1,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
        {ghost != null && ghostH > pct && (
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${ghostH * 100}%`, backgroundColor: g.soft }} />
        )}
        <Animated.View style={[{ backgroundColor: done ? g.fg : g.soft, opacity: done ? 1 : 0.95 }, fillStyle]}>
          {!done && <View style={{ height: 3, backgroundColor: g.fg, opacity: 0.9 }} />}
        </Animated.View>
      </View>
      {/* the 80% finish line */}
      <View style={[tile.line, { bottom: `${COMPLETE_AT * 100}%`, borderColor: done ? 'rgba(255,255,255,0.6)' : c.ink3 }]} />
      <View style={[tile.content, done && info.short.length > 3 && { paddingTop: 8 }]}>
        <Txt v="h3" numberOfLines={1} color={done ? '#fff' : c.ink} style={{ fontSize: (size > 70 ? 18 : 15) - (info.short.length > 3 ? 3 : 0), paddingHorizontal: 4 }}>
          {info.short}
        </Txt>
        <Txt v="caption" color={done ? '#fff' : noData ? c.ink3 : c.ink2} style={{ fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {noData ? 'no data' : fmtPct(pct)}
        </Txt>
      </View>
      {done && (
        <View style={[tile.badge, { backgroundColor: '#fff' }]}>
          <Icon name={I.check} size={10} color={g.fg} />
        </View>
      )}
    </Pressable>
  );
}

const tile = StyleSheet.create({
  base: { borderRadius: radius.md, overflow: 'hidden' },
  line: { position: 'absolute', left: 6, right: 6, borderTopWidth: 1.5, borderStyle: 'dashed' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  badge: { position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

// ── Bars ───────────────────────────────────────────────────────────────────

/** Eaten (solid) → planned for later today (pale) → remaining (track). */
export function MacroBar({
  label,
  eaten,
  planned = 0,
  target,
  unit,
  color,
  limit,
  compact,
}: {
  label: string;
  eaten: number;
  planned?: number;
  target: number;
  unit: string;
  color: string;
  /** a ceiling (sat fat, sodium): over target turns red */
  limit?: boolean;
  /** half-width layout: drop the "· x left" suffix */
  compact?: boolean;
}) {
  const c = useTheme();
  const max = Math.max(target, eaten + planned) || 1;
  const eatenW = (eaten / max) * 100;
  const plannedW = (planned / max) * 100;
  const over = limit && eaten > target;
  const left = Math.max(0, Math.round(target - eaten));
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="caption" style={{ fontWeight: '700' }}>
          {label}
        </Txt>
        <Txt v="caption" dim={1} style={{ fontVariant: ['tabular-nums'] }}>
          <Txt v="caption" style={{ fontWeight: '800' }} color={over ? c.danger : c.ink}>
            {Math.round(eaten)}
          </Txt>
          {' / '}
          {Math.round(target)} {unit}
          {limit ? (over ? '  over' : '  max') : compact ? (left > 0 ? '' : '  ✓') : left > 0 ? `  · ${left} left` : '  ✓'}
        </Txt>
      </Row>
      <View style={[bar.track, { backgroundColor: c.surface2 }]}>
        <View style={{ width: `${eatenW}%`, backgroundColor: over ? c.danger : color, borderRadius: radius.pill }} />
        {plannedW > 0 && <View style={{ width: `${plannedW}%`, backgroundColor: color, opacity: 0.25 }} />}
        {!limit && <View style={[bar.target, { left: `${(target / max) * 100}%`, backgroundColor: c.ink }]} />}
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  track: { height: 10, borderRadius: radius.pill, flexDirection: 'row', overflow: 'hidden' },
  target: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1 },
});

/** Compact micro chip: "C 140%" coloured by group. */
export function MicroChip({ k, pct }: { k: NutrientKey; pct: number }) {
  const c = useTheme();
  const info = NUTRIENTS[k];
  const g = groupColor(c, k === 'fiber' ? 'fiber' : info.group);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: radius.pill, backgroundColor: g.soft }}>
      <Txt v="caption" color={g.fg} style={{ fontWeight: '800', fontSize: 12 }}>
        {info.short}
      </Txt>
      <Txt v="caption" color={c.ink2} style={{ fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {fmtPct(pct)}
      </Txt>
    </View>
  );
}

export function Spacer({ h = space.md }: { h?: number }) {
  return <View style={{ height: h }} />;
}
