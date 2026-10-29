import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { addInto, boardProgress } from '@/engine/calc';
import { NUTRIENTS } from '@/engine/nutrients';
import { supplementCautions } from '@/lib/insights';
import { useDay } from '@/state/day';
import { today } from '@/state/store';
import { SUPPLEMENTS, useWellness, type Supplement } from '@/state/wellnessStore';
import { Card, Icon, I, IconButton, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';
import { MicroChip, fmtAmount } from '@/ui/viz';

const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Choose "my supplements", then tick "Taken today". Taken ones fill the board, marked as supplements. */
export default function Supplements() {
  const c = useTheme();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const date = dateParam ?? today();
  const isToday = date === today();

  const mine = useWellness((s) => s.supplements);
  const takenOn = useWellness((s) => s.takenOn);
  const setActive = useWellness((s) => s.setSupplementActive);
  const setTaken = useWellness((s) => s.setTaken);
  const day = useDay(date);

  const active = useMemo(() => {
    const ids = new Set(mine.filter((m) => m.active).map((m) => m.id));
    return SUPPLEMENTS.filter((s) => ids.has(s.id));
  }, [mine]);
  const others = useMemo(() => SUPPLEMENTS.filter((s) => !active.includes(s)), [active]);
  const taken = new Set(takenOn[date] ?? []);

  // warn before it happens: what the board would hold if every active supplement is taken
  const everything = addInto({ ...day.supplementTotals }, day.supplementPlanned);
  const cautions = supplementCautions(everything, day.projected, day.profile);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen
      bottomInset={40}
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <IconButton icon={I.back} label="Back" onPress={back} />
        </Row>
      }>
      <Txt v="title">Supplements</Txt>
      <Card tone="accentSoft" style={{ marginTop: space.lg, gap: 6 }}>
        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <Icon name={I.leaf} size={18} color={c.accent} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt v="bodyStrong" color={c.accent}>
              Food first.
            </Txt>
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              Supplements fill what food can’t easily reach, like vitamin D in winter. The ones you take count on your board, and the nutrient sheet shows how much of each came from them.
            </Txt>
          </View>
        </Row>
      </Card>

      {cautions.length > 0 && (
        <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.danger, gap: 4 }}>
          <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <Icon name={I.info} size={16} color={c.danger} />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="caption" color={c.danger} style={{ fontWeight: '700' }}>
                Above an upper limit
              </Txt>
              {cautions.map((x) => (
                <Txt key={x.key} v="caption" color={c.danger} style={{ lineHeight: 18 }}>
                  {x.kind === 'total'
                    ? `${NUTRIENTS[x.key].label}: ${fmtAmount(x.amount, NUTRIENTS[x.key].unit)} from food and supplements, over the ${fmtAmount(x.limit, NUTRIENTS[x.key].unit)} upper limit.`
                    : `${NUTRIENTS[x.key].label}: ${fmtAmount(x.amount, NUTRIENTS[x.key].unit)} from supplements alone, over the ${fmtAmount(x.limit, NUTRIENTS[x.key].unit)} limit for supplements.`}
                </Txt>
              ))}
              <Txt v="caption" color={c.danger} style={{ lineHeight: 18 }}>
                More isn’t better here. Consider dropping one.
              </Txt>
            </View>
          </Row>
        </View>
      )}

      <Section title="My supplements">
        {active.length === 0 ? (
          <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
            Nothing yet. Add what you already take below. Skipping supplements entirely is a fine plan too.
          </Txt>
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {active.map((s, i) => (
              <ActiveRow
                key={s.id}
                s={s}
                first={i === 0}
                isToday={isToday}
                date={date}
                taken={taken.has(s.id)}
                onToggle={() => {
                  tap(taken.has(s.id) ? 'light' : 'success');
                  setTaken(date, s.id, !taken.has(s.id));
                }}
                onRemove={() => setActive(s.id, false)}
                who={day.profile}
              />
            ))}
          </Card>
        )}
        {active.length > 0 && (
          <Txt v="caption" dim={2}>
            {isToday ? 'Tick each one when you’ve taken it.' : `Marking for ${fmtDate(date)}.`} Tap any tile to see how much of it came from supplements.
          </Txt>
        )}
      </Section>

      {others.length > 0 && (
        <Section title="Add a supplement">
          <Card style={{ paddingVertical: space.xs }}>
            {others.map((s, i) => (
              <Row key={s.id} gap={space.md} style={{ paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{s.name}</Txt>
                  <Txt v="caption" dim={2}>
                    {s.dose}
                  </Txt>
                </View>
                <IconButton icon={I.add} label={`Add ${s.name} ${s.dose} to my supplements`} onPress={() => setActive(s.id, true)} />
              </Row>
            ))}
          </Card>
        </Section>
      )}

      <Txt v="caption" dim={2} style={{ marginTop: space.xl, lineHeight: 18 }}>
        Check with your doctor or pharmacist before starting a new one, especially if you’re pregnant, breastfeeding or take medication. Doses are per tablet or capsule as listed.
      </Txt>
    </Screen>
  );
}

function ActiveRow({
  s,
  first,
  isToday,
  date,
  taken,
  onToggle,
  onRemove,
  who,
}: {
  s: Supplement;
  first: boolean;
  isToday: boolean;
  date: string;
  taken: boolean;
  onToggle: () => void;
  onRemove: () => void;
  who: Parameters<typeof boardProgress>[1];
}) {
  const c = useTheme();
  const chips = boardProgress(s.n, who)
    .filter((p) => p.amount != null)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2);
  const when = isToday ? 'today' : fmtDate(date);
  return (
    <Row gap={space.md} style={{ paddingVertical: space.md, borderTopWidth: first ? 0 : 1, borderTopColor: c.line, alignItems: 'flex-start' }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${s.name} ${s.dose}, taken ${when}`}
        accessibilityState={{ checked: taken }}
        hitSlop={8}
        onPress={onToggle}
        style={{
          width: 30,
          height: 30,
          marginTop: 2,
          borderRadius: 15,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: taken ? c.accent : c.ink3,
          backgroundColor: taken ? c.accent : c.surface,
        }}>
        {taken && <Icon name={I.check} size={14} color={c.accentInk} />}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View>
          <Txt v="bodyStrong">{s.name}</Txt>
          <Txt v="caption" dim={2}>
            {s.dose} · {taken ? `Taken ${when}` : `Not yet ${when}`}
          </Txt>
        </View>
        {chips.length > 0 && (
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {chips.map((p) => (
              <MicroChip key={p.key} k={p.key} pct={p.pct} />
            ))}
          </Row>
        )}
        {s.note && (
          <Txt v="caption" dim={2}>
            {s.note}
          </Txt>
        )}
      </View>
      <IconButton icon={I.close} label={`Remove ${s.name} ${s.dose} from my supplements`} onPress={onRemove} />
    </Row>
  );
}
