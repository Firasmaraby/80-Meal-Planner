import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { AndroidSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, MAX_WIDTH, radius, space, useTheme, type Palette } from './theme';

// ── Text ───────────────────────────────────────────────────────────────────

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'num' | 'numLg';

const variants: Record<Variant, TextStyle> = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8, fontFamily: font.rounded },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5, fontFamily: font.rounded },
  h2: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  h3: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '500' },
  num: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], fontFamily: font.rounded },
  numLg: { fontSize: 30, lineHeight: 34, fontWeight: '800', fontVariant: ['tabular-nums'], fontFamily: font.rounded, letterSpacing: -0.5 },
};

export function Txt({
  v = 'body',
  color,
  dim,
  style,
  ...rest
}: TextProps & { v?: Variant; color?: string; dim?: 1 | 2 }) {
  const c = useTheme();
  const tone = color ?? (dim === 2 ? c.ink3 : dim === 1 ? c.ink2 : c.ink);
  return <Text style={[{ color: tone, fontFamily: font.sans }, variants[v], style]} {...rest} />;
}

// ── Icon ───────────────────────────────────────────────────────────────────

export type IconName = { ios: SFSymbol; md: AndroidSymbol };

export const I = {
  today: { ios: 'sun.max.fill', md: 'wb_sunny' },
  board: { ios: 'square.grid.3x3.fill', md: 'grid_view' },
  plans: { ios: 'fork.knife', md: 'restaurant_menu' },
  learn: { ios: 'book.fill', md: 'menu_book' },
  you: { ios: 'person.crop.circle.fill', md: 'account_circle' },
  add: { ios: 'plus', md: 'add' },
  check: { ios: 'checkmark', md: 'check' },
  swap: { ios: 'arrow.left.arrow.right', md: 'swap_horiz' },
  search: { ios: 'magnifyingglass', md: 'search' },
  close: { ios: 'xmark', md: 'close' },
  flame: { ios: 'flame.fill', md: 'local_fire_department' },
  leaf: { ios: 'leaf.fill', md: 'eco' },
  fish: { ios: 'fish.fill', md: 'set_meal' },
  cart: { ios: 'cart.fill', md: 'shopping_cart' },
  info: { ios: 'info.circle', md: 'info' },
  chevron: { ios: 'chevron.right', md: 'chevron_right' },
  back: { ios: 'chevron.left', md: 'arrow_back' },
  bolt: { ios: 'bolt.fill', md: 'bolt' },
  spark: { ios: 'sparkles', md: 'auto_awesome' },
  calendar: { ios: 'calendar', md: 'calendar_month' },
  upload: { ios: 'square.and.arrow.up', md: 'upload_file' },
  minus: { ios: 'minus', md: 'remove' },
  bulb: { ios: 'lightbulb.fill', md: 'lightbulb' },
  target: { ios: 'scope', md: 'target' },
  edit: { ios: 'pencil', md: 'edit' },
  undo: { ios: 'arrow.uturn.backward', md: 'undo' },
  trash: { ios: 'trash', md: 'delete' },
  settings: { ios: 'gearshape.fill', md: 'settings' },
  trend: { ios: 'chart.line.uptrend.xyaxis', md: 'trending_up' },
  star: { ios: 'star.fill', md: 'star' },
  lock: { ios: 'lock.fill', md: 'lock' },
  heart: { ios: 'heart.fill', md: 'favorite' },
  clock: { ios: 'clock', md: 'history' },
} satisfies Record<string, IconName>;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const c = useTheme();
  return (
    <SymbolView
      name={{ ios: name.ios, android: name.md, web: name.md }}
      size={size}
      tintColor={color ?? c.ink}
      weight="semibold"
    />
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────

export function Screen({
  children,
  scroll = true,
  header,
  contentStyle,
  bottomInset = 110,
}: {
  children: ReactNode;
  scroll?: boolean;
  header?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  bottomInset?: number;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const inner = (
    <View style={[styles.inner, contentStyle]}>
      {header}
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + bottomInset }}
          showsVerticalScrollIndicator={false}>
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + space.md }}>{inner}</View>
      )}
    </View>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: keyof Palette }) {
  const c = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tone ? (c[tone] as string) : c.surface, borderColor: c.line, shadowColor: c.shadow },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm, marginTop: space.xl }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label" dim={1}>
          {title}
        </Txt>
        {action}
      </Row>
      {children}
    </View>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

export function tap(kind: 'light' | 'success' | 'select' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'select') Haptics.selectionAsync();
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  small,
  style,
  disabled,
  ...rest
}: Omit<PressableProps, 'style'> & {
  label: string;
  kind?: 'primary' | 'secondary' | 'ghost' | 'done';
  icon?: IconName;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const bg = { primary: c.ink, secondary: c.surface2, ghost: 'transparent', done: c.accentSoft }[kind];
  const fg = { primary: c.bg, secondary: c.ink, ghost: c.ink, done: c.accent }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={(e) => {
        tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
      {...rest}>
      {icon && <Icon name={icon} size={small ? 14 : 17} color={fg} />}
      <Txt v={small ? 'caption' : 'bodyStrong'} color={fg} style={{ fontWeight: '700' }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const tint = color ?? c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        tap('select');
        onPress?.();
      }}
      style={[
        styles.chip,
        { borderColor: active ? tint : c.line, backgroundColor: active ? tint : c.surface },
        style,
      ]}>
      <Txt v="caption" color={active ? c.bg : c.ink} style={{ fontWeight: '700' }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone }: { icon: IconName; onPress: () => void; label: string; tone?: 'filled' }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: tone === 'filled' ? c.ink : c.surface2, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Icon name={icon} size={16} color={tone === 'filled' ? c.bg : c.ink} />
    </Pressable>
  );
}

export function Stepper({ value, onChange, step = 5, unit = 'g' }: { value: number; onChange: (v: number) => void; step?: number; unit?: string }) {
  return (
    <Row gap={space.sm}>
      <IconButton icon={I.minus} label="Less" onPress={() => onChange(Math.max(step, value - step))} />
      <Txt v="num" style={{ minWidth: 56, textAlign: 'center' }}>
        {Math.round(value)} {unit}
      </Txt>
      <IconButton icon={I.add} label="More" onPress={() => onChange(value + step)} />
    </Row>
  );
}

const styles = StyleSheet.create({
  inner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg },
  card: {
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 50,
    borderRadius: radius.pill,
  },
  buttonSmall: { height: 34, paddingHorizontal: space.md, gap: 6 },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
