import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';

import { food, foodSearch } from '@/state/catalog';
import { useDay } from '@/state/day';
import { today, useStore } from '@/state/store';
import { Card, Chip, Icon, I, IconButton, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

const CATEGORY_DISLIKES = [
  { key: 'cat:fish', label: 'No fish' },
  { key: 'cat:meat', label: 'No red meat' },
  { key: 'cat:dairy', label: 'No dairy' },
  { key: 'cat:egg', label: 'No eggs' },
] as const;

function dislikeLabel(d: string): string {
  const cat = CATEGORY_DISLIKES.find((x) => x.key === d);
  if (cat) return cat.label;
  if (d.startsWith('cat:')) return `No ${d.slice(4).replace(/_/g, ' ')}`;
  return food(d)?.name ?? d;
}

const short = (id: string) => food(id)?.name.split(',')[0] ?? id;

/** How the plan is made yours: sized to your calories, and swapped around what you won't eat. */
export default function FoodPreferences() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const day = useDay(today());
  const [query, setQuery] = useState('');

  const { dislikes, sizeToMe } = profile;
  const toggleDislike = (d: string) =>
    setProfile({ dislikes: dislikes.includes(d) ? dislikes.filter((x) => x !== d) : [...dislikes, d] });

  const q = query.trim();
  const results = useMemo(
    () =>
      q
        ? foodSearch
            .search(q, { limit: 12 })
            .map((h) => h.food)
            .filter((f) => !dislikes.includes(f.id) && !dislikes.includes(`cat:${f.category}`))
            .slice(0, 6)
        : [],
    [q, dislikes],
  );

  const swaps = day.sizing?.swaps ?? [];
  const unresolved = day.sizing?.unresolved ?? [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen
      bottomInset={40}
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <IconButton icon={I.back} label="Back" onPress={back} />
        </Row>
      }>
      <Txt v="title">Food preferences</Txt>
      <Txt v="body" dim={1} style={{ marginTop: space.xs }}>
        Changes apply to your plan right away.
      </Txt>

      <Card style={{ marginTop: space.lg }}>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Txt v="h3">Size plans to my calories</Txt>
            <Txt v="caption" dim={1} style={{ marginTop: 4, lineHeight: 18 }}>
              Portions are scaled to your target, vegetables and fruit are never cut, and nutrients that are already covered are protected.
            </Txt>
          </View>
          <Switch
            accessibilityLabel="Size plans to my calories"
            value={sizeToMe}
            onValueChange={(v) => {
              tap('select');
              setProfile({ sizeToMe: v });
            }}
            trackColor={{ true: c.accent, false: c.line }}
          />
        </Row>
      </Card>

      <Section title="Foods I don’t eat">
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {CATEGORY_DISLIKES.map((x) => (
            <Chip key={x.key} label={x.label} active={dislikes.includes(x.key)} onPress={() => toggleDislike(x.key)} />
          ))}
        </Row>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            height: 48,
            paddingHorizontal: space.md,
            borderRadius: radius.pill,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.line,
            marginTop: space.xs,
          }}>
          <Icon name={I.search} size={17} color={c.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Add a food: salmon, cilantro, tofu…"
            placeholderTextColor={c.ink3}
            accessibilityLabel="Search for a food to avoid"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, height: 48, color: c.ink, fontSize: 16, outlineStyle: 'none' } as never}
          />
          {query.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}>
              <Icon name={I.close} size={14} color={c.ink3} />
            </Pressable>
          )}
        </View>

        {q.length > 0 && (
          <Card style={{ paddingVertical: space.xs }}>
            {results.length === 0 ? (
              <Txt v="caption" dim={2} style={{ paddingVertical: space.md }}>
                Nothing new for “{q}”. Try a simpler word.
              </Txt>
            ) : (
              results.map((f, i) => (
                <Row key={f.id} gap={space.md} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                  <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>
                    {f.name}
                  </Txt>
                  <IconButton
                    icon={I.add}
                    label={`Don’t suggest ${f.name}`}
                    onPress={() => {
                      tap('select');
                      toggleDislike(f.id);
                      setQuery('');
                    }}
                  />
                </Row>
              ))
            )}
          </Card>
        )}

        {dislikes.length === 0 ? (
          <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
            Nothing here yet. Anything you add is swapped for the closest food by vitamins and minerals.
          </Txt>
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {dislikes.map((d, i) => (
              <Row key={d} gap={space.md} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>
                  {dislikeLabel(d)}
                </Txt>
                <IconButton icon={I.close} label={`Remove ${dislikeLabel(d)}`} onPress={() => toggleDislike(d)} />
              </Row>
            ))}
          </Card>
        )}
      </Section>

      <Section title="What it does to your plan">
        <Card style={{ gap: space.sm }}>
          {day.sizing ? (
            <>
              <Txt v="h3" accessibilityLiveRegion="polite">
                Today: {swaps.length} ingredient{swaps.length === 1 ? '' : 's'} swapped
              </Txt>
              {swaps.slice(0, 5).map((s) => (
                <Txt key={`${s.from}-${s.to}`} v="caption" dim={1}>
                  {short(s.from)} → {short(s.to)}
                </Txt>
              ))}
              {swaps.length > 5 && (
                <Txt v="caption" dim={2}>
                  and {swaps.length - 5} more
                </Txt>
              )}
              {unresolved.length > 0 && (
                <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
                  No close swap for {unresolved.map(short).join(', ')}. Open the meal to replace it yourself.
                </Txt>
              )}
              <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
                {sizeToMe
                  ? `Sized to ${day.sizing.kcal.toLocaleString()} kcal for your ${day.sizing.target.toLocaleString()} kcal target.`
                  : 'Plan portions are as written.'}
              </Txt>
            </>
          ) : (
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              Pick a plan and you’ll see exactly what gets swapped for you here.
            </Txt>
          )}
        </Card>
      </Section>
    </Screen>
  );
}
