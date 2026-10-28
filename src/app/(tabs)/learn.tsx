import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEARN } from '@/content/tips';
import { BOARD_KEYS, NUTRIENTS } from '@/engine/nutrients';
import type { NutrientKey } from '@/engine/types';
import { Button, Card, Icon, I, Row, Txt, tap } from '@/ui/primitives';
import { MAX_WIDTH, groupColor, radius, space, useTheme } from '@/ui/theme';

const SUBSTACK = 'https://firasmaraby.substack.com';

const GUIDE: { title: string; keys: NutrientKey[] }[] = [
  { title: 'Vitamins', keys: BOARD_KEYS.filter((k) => NUTRIENTS[k].group === 'vitamin') },
  { title: 'Minerals', keys: BOARD_KEYS.filter((k) => NUTRIENTS[k].group === 'mineral') },
  { title: 'Fiber', keys: BOARD_KEYS.filter((k) => k === 'fiber') },
];

export default function Learn() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [openId, setOpenId] = useState<string | null>(open && LEARN.some((l) => l.id === open) ? open : null);
  const scroller = useRef<{ scrollTo: (o: { y: number; animated?: boolean }) => void }>(null);
  const ys = useRef<Record<string, number>>({});
  const pending = useRef<string | null>(openId);
  // card y is relative to the list wrapper, which sits in the padded column: add both offsets
  const offsets = useRef({ column: 0, list: 0 });

  const scrollTo = useCallback((id: string) => {
    const local = ys.current[id];
    if (local == null) return false;
    const y = local + offsets.current.list + offsets.current.column;
    scroller.current?.scrollTo({ y: Math.max(0, y - space.md), animated: true });
    return true;
  }, []);

  // deep links: /learn?open=three expands and scrolls to that card, even when the tab is already mounted
  useEffect(() => {
    if (!open || !LEARN.some((l) => l.id === open)) return;
    setOpenId(open);
    pending.current = open;
    const t = setTimeout(() => {
      if (scrollTo(open)) pending.current = null;
    }, 80);
    return () => clearTimeout(t);
  }, [open, scrollTo]);

  const openSubstack = async () => {
    tap();
    try {
      await WebBrowser.openBrowserAsync(SUBSTACK);
    } catch {
      Linking.openURL(SUBSTACK).catch(() => {});
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        ref={(node) => {
          scroller.current = node;
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + 110 }}>
        <View
          onLayout={(e) => {
            offsets.current.column = e.nativeEvent.layout.y;
          }}
          style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg }}>
          <Txt v="label" dim={1}>
            Learn
          </Txt>
          <Card tone="accentSoft" style={{ marginTop: space.sm, padding: space.xl, gap: space.sm }}>
            <Row gap={6}>
              <Icon name={I.spark} size={16} color={c.accent} />
              <Txt v="label" color={c.accent}>
                Start here
              </Txt>
            </Row>
            <Txt v="display" style={{ fontSize: 30, lineHeight: 36 }}>
              The framework, in five minutes.
            </Txt>
            <Txt v="body" dim={1}>
              Six short cards: why micros come first, why 80%, and how to build the habit three nutrients at a time. Tap one to open it.
            </Txt>
          </Card>

          <View
            onLayout={(e) => {
              offsets.current.list = e.nativeEvent.layout.y;
            }}
            style={{ gap: space.sm, marginTop: space.xl }}>
            {LEARN.map((card, i) => {
              const isOpen = openId === card.id;
              return (
                <View
                  key={card.id}
                  onLayout={(e) => {
                    ys.current[card.id] = e.nativeEvent.layout.y;
                    if (pending.current === card.id) {
                      // wait a frame so the expanded card has its final position
                      setTimeout(() => {
                        if (scrollTo(card.id)) pending.current = null;
                      }, 50);
                    }
                  }}>
                  <Card style={{ padding: 0, borderColor: isOpen ? c.ink : c.line }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${card.title}. ${card.kicker}`}
                      accessibilityState={{ expanded: isOpen }}
                      onPress={() => {
                        tap('select');
                        setOpenId(isOpen ? null : card.id);
                      }}
                      style={({ pressed }) => ({ padding: space.lg, gap: 4, opacity: pressed ? 0.8 : 1 })}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Txt v="label" dim={2}>
                          {String(i + 1).padStart(2, '0')} · {card.kicker}
                        </Txt>
                        <View style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}>
                          <Icon name={I.chevron} size={14} color={c.ink3} />
                        </View>
                      </Row>
                      <Txt v="h2">{card.title}</Txt>
                      {!isOpen && (
                        <Txt v="caption" dim={1} numberOfLines={2} style={{ lineHeight: 18 }}>
                          {card.paragraphs[0]}
                        </Txt>
                      )}
                    </Pressable>
                    {isOpen && (
                      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
                        {card.paragraphs.map((p, j) => (
                          <Txt key={j} v="body" style={{ lineHeight: 23 }}>
                            {p}
                          </Txt>
                        ))}
                      </View>
                    )}
                  </Card>
                </View>
              );
            })}
          </View>

          <View style={{ marginTop: space.xxl }}>
            <Txt v="label" dim={1}>
              Nutrient field guide
            </Txt>
            <Txt v="caption" dim={2} style={{ marginTop: 4, lineHeight: 18 }}>
              Every tile on your board, and why it earns the space. Tap one for your numbers and the easiest foods.
            </Txt>
          </View>

          {GUIDE.map((g) => (
            <View key={g.title} style={{ marginTop: space.lg, gap: space.sm }}>
              <Txt v="caption" dim={2} style={{ fontWeight: '700' }}>
                {g.title}
              </Txt>
              <Card style={{ padding: 0 }}>
                {g.keys.map((k, i) => {
                  const info = NUTRIENTS[k];
                  const col = groupColor(c, k === 'fiber' ? 'fiber' : info.group);
                  return (
                    <Pressable
                      key={k}
                      accessibilityRole="link"
                      accessibilityLabel={`${info.label}. ${info.why ?? ''}`}
                      onPress={() => {
                        tap('select');
                        router.push({ pathname: '/nutrient/[key]', params: { key: k } });
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        borderTopWidth: i ? 1 : 0,
                        borderTopColor: c.line,
                        opacity: pressed ? 0.75 : 1,
                      })}>
                      <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: col.soft, alignItems: 'center', justifyContent: 'center' }}>
                        <Txt v="h3" color={col.fg}>
                          {info.short}
                        </Txt>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Row gap={6}>
                          <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {info.label}
                          </Txt>
                          {info.sparse && (
                            <Txt v="caption" dim={2} style={{ fontSize: 11 }}>
                              limited data
                            </Txt>
                          )}
                        </Row>
                        {info.why && (
                          <Txt v="caption" dim={1} numberOfLines={2} style={{ lineHeight: 17 }}>
                            {info.why}
                          </Txt>
                        )}
                      </View>
                      <Icon name={I.chevron} size={13} color={c.ink3} />
                    </Pressable>
                  );
                })}
              </Card>
            </View>
          ))}

          <Card style={{ marginTop: space.xxl, gap: space.sm }}>
            <Txt v="h3">Want the long version?</Txt>
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              The framework comes from a kinesiologist and coach who writes about it every week.
            </Txt>
            <Button kind="secondary" label="Read more on Substack" icon={I.chevron} onPress={openSubstack} style={{ marginTop: space.xs }} />
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
