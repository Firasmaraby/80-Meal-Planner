import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TASTE_CARDS, type Taste } from '@/engine/match';
import type { Ingredient } from '@/engine/types';
import { LIBRARY_RECIPES } from '@/state/catalog';

import { MealArt } from '../MealArt';
import { Button, Card, Row, Txt, tap } from '../primitives';
import { radius, space, useTheme } from '../theme';

type TasteCardData = (typeof TASTE_CARDS)[number];
type Answer = Taste | 'skip';
const EXIT_MS = 240;

/** The dish's plate ingredients, from the recipe library. */
function ingredientsOf(recipeId: string): Ingredient[] {
  const r = LIBRARY_RECIPES.find((x) => x.id === recipeId);
  return r ? r.ingredients.map(([foodId, grams]) => ({ foodId, grams })) : [];
}

/** One dish at a time: a big plate, its name, "Not for me" or "Yum". The card slides away on an answer. */
export function TasteCard({ card, onAnswer }: { card: TasteCardData; onAnswer: (a: Answer) => void }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const ingredients = useMemo(() => ingredientsOf(card.recipeId), [card.recipeId]);
  const x = useSharedValue(60);
  const op = useSharedValue(0);
  const gone = useRef(false);
  const [answered, setAnswered] = useState<Answer | null>(null);
  useEffect(() => {
    x.set(withTiming(0, { duration: 260 }));
    op.set(withTiming(1, { duration: 260 }));
  }, [x, op]);
  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateX: x.value }, { rotate: `${x.value / 30}deg` }],
  }));
  const answer = (a: Answer) => {
    if (gone.current) return;
    gone.current = true;
    tap();
    setAnswered(a);
    const dir = a === 'yum' ? 1 : a === 'nah' ? -1 : 0;
    x.set(withTiming(dir * Math.min(width, 420), { duration: EXIT_MS }));
    op.set(withTiming(0, { duration: EXIT_MS }));
    setTimeout(() => onAnswer(a), EXIT_MS);
  };
  const big = 110;
  return (
    <Animated.View style={style}>
      <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.md }}>
        <View style={{ width: big + 20, height: big + 20, borderRadius: (big + 20) / 2, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <MealArt ingredients={ingredients} size={big} />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Txt v="label" dim={2}>{`From ${card.from}`}</Txt>
          <Txt v="h2" style={{ textAlign: 'center' }}>
            {card.title}
          </Txt>
          <Txt v="body" dim={1} style={{ textAlign: 'center', minHeight: 63 }}>
            {card.blurb}
          </Txt>
        </View>
        <Row gap={space.md} style={{ alignSelf: 'stretch' }}>
          <Button kind="secondary" label="Not for me" style={{ flex: 1, height: 56 }} disabled={answered != null} onPress={() => answer('nah')} />
          <Button label="Yum" style={{ flex: 1, height: 56 }} disabled={answered != null} onPress={() => answer('yum')} />
        </Row>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip this dish" hitSlop={10} disabled={answered != null} onPress={() => answer('skip')} style={{ marginTop: -space.xs }}>
          <Txt v="caption" color={c.ink2} style={{ fontWeight: '700' }}>
            Skip
          </Txt>
        </Pressable>
      </Card>
    </Animated.View>
  );
}

/** Dots for how far through the taste test someone is. */
export function TasteDots({ index, total = TASTE_CARDS.length }: { index: number; total?: number }) {
  const c = useTheme();
  return (
    <Row gap={6} style={{ justifyContent: 'center' }}>
      <View accessible accessibilityLabel={`Dish ${Math.min(index + 1, total)} of ${total}`} style={{ flexDirection: 'row', gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ width: i === index ? 18 : 8, height: 8, borderRadius: radius.pill, backgroundColor: i <= index ? c.ink : c.surface2 }} />
        ))}
      </View>
    </Row>
  );
}

/** The whole taste test: cards in order, then `onDone`. */
export function TasteTest({ onChange, onDone }: { onChange: (g: TasteCardData['group'], t: Taste | undefined) => void; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const card = TASTE_CARDS[index];
  const answer = (a: Answer) => {
    onChange(card.group, a === 'skip' ? undefined : a);
    if (index >= TASTE_CARDS.length - 1) onDone();
    else setIndex(index + 1);
  };
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ minHeight: 390 }}>
        <TasteCard key={card.group} card={card} onAnswer={answer} />
      </View>
      <TasteDots index={index} />
    </View>
  );
}
