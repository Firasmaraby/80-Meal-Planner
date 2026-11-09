import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { FLAVOUR_LABEL, REASONS, TASTE_CARDS, type Budget, type CookingFor, type QuizAnswers, type WeeknightTime } from '@/engine/match';

import { carbLabel } from '../carbParts';
import { DIET_OPTIONS } from '../planParts';
import { Txt } from '../primitives';
import { radius, space, useTheme } from '../theme';
import { LiveBoard } from './LiveBoard';
import { PlanCounter } from './PlanCounter';

const TIME_CHIP: Record<WeeknightTime, string> = { quick: '15-minute dinners', medium: '30-minute dinners', love: 'Happy to cook' };
const WHO_CHIP: Record<CookingFor, string> = { one: 'Cooking for one', two: 'Cooking for two', family: 'Cooking for a family' };
const BUDGET_CHIP: Record<Budget, string> = { cheap: 'Budget-friendly', middle: 'Middle of the road budget', treat: 'Treat me' };

/** "Your plan so far": one short line per answer given. */
export function quizSummary(a: QuizAnswers): string[] {
  const out: string[] = [];
  for (const r of a.reasons) out.push(REASONS.find((x) => x.key === r)?.label ?? r);
  const yums = TASTE_CARDS.filter((t) => a.tastes[t.group] === 'yum').map((t) => FLAVOUR_LABEL[t.group]);
  if (yums.length) out.push(yums.length > 2 ? `${yums.slice(0, 2).join(', ')} and ${yums.length - 2} more` : yums.join(', '));
  if (a.diet.length) out.push(a.diet.map((d) => DIET_OPTIONS.find((o) => o.key === d)?.label ?? d).join(', '));
  if (a.carbStyle) out.push(carbLabel(a.carbStyle));
  if (a.time) out.push(TIME_CHIP[a.time]);
  if (a.cookingFor) out.push(WHO_CHIP[a.cookingFor]);
  if (a.budget) out.push(BUDGET_CHIP[a.budget]);
  return out;
}

/** A soft fade on the right edge, so the chip row reads as scrollable. */
function FadeEdge() {
  const c = useTheme();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[`${c.bg}00`, c.bg]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 36, zIndex: 1 }}
    />
  );
}

/** The live builder shown above each quiz question: the plan counter, the filling board and the answers so far. */
export function LiveBuilder({ remaining, progress, answers }: { remaining: number; progress: number; answers: QuizAnswers }) {
  const c = useTheme();
  const chips = quizSummary(answers);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 118 }}>
          <PlanCounter value={remaining} />
        </View>
        <View style={{ flex: 1 }}>
          <LiveBoard progress={progress} />
        </View>
      </View>
      <View style={{ height: 30 }}>
        {chips.length > 0 ? <FadeEdge /> : null}
        {chips.length === 0 ? (
          <Txt v="caption" dim={2} style={{ lineHeight: 30 }}>
            Your plan so far: not much yet
          </Txt>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }} accessibilityLabel={`Your plan so far: ${chips.join(', ')}`}>
            {chips.map((t) => (
              <Animated.View key={t} entering={FadeIn.duration(240)} style={{ height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.surface2, justifyContent: 'center' }}>
                <Txt v="caption" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {t}
                </Txt>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
