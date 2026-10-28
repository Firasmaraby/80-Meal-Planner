import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import type { MealPlan } from '@/engine/types';
import { checkPlanBand } from '@/import/validatePlan';
import { parsePlanWorkbook, type ImportIssue } from '@/import/planWorkbook';
import { uploadPlans } from '@/lib/plansRepo';
import { isBackendConfigured } from '@/lib/supabase';
import { food, foodResolver } from '@/state/catalog';
import { useStore } from '@/state/store';
import { Button, Card, Icon, I, IconButton, type IconName, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TEMPLATE_PATH = 'templates/MealPlan_Template.xlsx';

interface Report {
  fileName: string;
  plans: MealPlan[];
  issues: ImportIssue[];
}

const kcalFor = (foodId: string, g: number) => ((food(foodId)?.n.kcal ?? 0) * g) / 100;

function dayKcal(plan: MealPlan): number[] {
  return plan.days.map((d) => Math.round(d.meals.reduce((s, m) => s + m.ingredients.reduce((t, i) => t + kcalFor(i.foodId, i.grams), 0), 0)));
}

function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, onPress: onConfirm },
  ]);
}

export default function Admin() {
  const c = useTheme();
  const addLocalPlans = useStore((s) => s.addLocalPlans);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<'read' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const errors = useMemo(() => report?.issues.filter((i) => i.level === 'error') ?? [], [report]);
  const warnings = useMemo(() => report?.issues.filter((i) => i.level === 'warning') ?? [], [report]);
  const ready = !!report && errors.length === 0 && report.plans.length > 0;

  const choose = async () => {
    setError(null);
    setDone(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: [XLSX_MIME, 'application/vnd.ms-excel'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setBusy('read');
      // on web the asset carries a File; on native a file:// uri. fetch handles both.
      const buffer = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
      const { plans, issues } = parsePlanWorkbook(buffer, foodResolver);
      const band = plans.flatMap((p) => checkPlanBand(p, kcalFor));
      setReport({ fileName: asset.name, plans, issues: [...issues, ...band] });
    } catch (e) {
      setReport(null);
      setError(`Couldn’t read that file. ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setBusy(null);
    }
  };

  const saveLocal = () => {
    if (!report || !ready) return;
    tap('success');
    addLocalPlans(report.plans);
    setDone(`Saved ${report.plans.length} ${report.plans.length === 1 ? 'plan' : 'plans'} on this device. Find them under Plans.`);
  };

  const publish = () => {
    if (!report || !ready) return;
    confirmAction(
      'Publish to everyone?',
      `${report.plans.length} ${report.plans.length === 1 ? 'plan goes' : 'plans go'} live for every user as a new version. Published versions can’t be edited.`,
      'Publish',
      async () => {
        setError(null);
        setDone(null);
        setBusy('publish');
        try {
          const out = await uploadPlans(report.plans, { publish: true });
          tap('success');
          setDone(`Published ${out.length === 1 ? '1 plan' : `${out.length} plans`}: ${out.map((o) => `${o.id} v${o.version}`).join(', ')}.`);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Publishing failed. Nothing was made live.');
        } finally {
          setBusy(null);
        }
      },
    );
  };

  return (
    <Screen
      bottomInset={60}
      header={
        <View style={{ marginBottom: space.lg, gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton icon={I.back} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
            <ModePill />
          </Row>
          <Txt v="label" dim={1} style={{ marginTop: space.sm }}>
            Plan admin
          </Txt>
          <Txt v="title">Upload meal plans</Txt>
          <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
            Fill in an Excel template. Nutrition is never typed in: it’s computed from the food database, so every plan is held to the same numbers.
          </Txt>
        </View>
      }>
      <Card style={{ gap: space.lg }}>
        <Step n={1} title="Get the template">
          <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
            It lives in the repo at
          </Txt>
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: c.surface2 }}>
            <Txt v="caption" selectable style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' }), fontWeight: '600' }}>
              {TEMPLATE_PATH}
            </Txt>
          </View>
          {Platform.OS === 'web' && (
            <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
              Open it from your checkout or download it from the repository, then fill it in.
            </Txt>
          )}
        </Step>
        <Step n={2} title="Fill it in">
          <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
            Plans, Meals and Ingredients sheets. Name each ingredient plainly (“salmon, baked”) with grams. We match it to the closest food and flag anything unsure.
          </Txt>
        </Step>
        <Step n={3} title="Upload and check">
          <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
            We read it, compute calories per day against the plan’s band, and list anything to fix before it goes anywhere.
          </Txt>
          <Button
            label={busy === 'read' ? 'Reading…' : report ? 'Choose another .xlsx' : 'Choose .xlsx'}
            icon={I.upload}
            disabled={busy != null}
            onPress={choose}
            style={{ marginTop: space.xs }}
          />
        </Step>
      </Card>

      {error && (
        <Banner tone="danger" icon={I.info}>
          {error}
        </Banner>
      )}
      {done && (
        <Banner tone="accent" icon={I.check}>
          {done}
        </Banner>
      )}

      {report && (
        <>
          <Section title={`Report · ${report.fileName}`}>
            <Card style={{ gap: space.md }}>
              <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
                <Count n={report.plans.length} label={report.plans.length === 1 ? 'plan' : 'plans'} />
                <Count n={errors.length} label={errors.length === 1 ? 'error' : 'errors'} color={errors.length ? c.danger : c.ink3} />
                <Count n={warnings.length} label={warnings.length === 1 ? 'warning' : 'warnings'} color={warnings.length ? c.warn : c.ink3} />
              </Row>
              <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
                {errors.length > 0
                  ? 'Fix the errors in the sheet and upload it again. Nothing is saved until the file is clean.'
                  : report.plans.length === 0
                    ? 'No plans found in this file.'
                    : warnings.length > 0
                      ? 'Good to go. The warnings are worth a look but won’t block the upload.'
                      : 'Clean. Every plan is ready.'}
              </Txt>
            </Card>
          </Section>

          {report.plans.length > 0 && (
            <Section title="Plans found">
              <View style={{ gap: space.sm }}>
                {report.plans.map((p) => (
                  <PlanSummary key={p.id} plan={p} />
                ))}
              </View>
            </Section>
          )}

          {errors.length > 0 && <IssueGroup title="Errors" issues={errors} tone="danger" startOpen />}
          {warnings.length > 0 && <IssueGroup title="Warnings" issues={warnings} tone="warn" startOpen={errors.length === 0} />}

          <View style={{ gap: space.sm, marginTop: space.xl }}>
            {isBackendConfigured && (
              <Button
                label={busy === 'publish' ? 'Publishing…' : 'Publish to everyone'}
                icon={I.upload}
                disabled={!ready || busy != null}
                onPress={publish}
              />
            )}
            <Button
              kind={isBackendConfigured ? 'secondary' : 'primary'}
              label="Save on this device"
              icon={I.check}
              disabled={!ready || busy != null}
              onPress={saveLocal}
            />
            <Txt v="caption" dim={2} style={{ lineHeight: 18 }}>
              {isBackendConfigured
                ? 'Publishing creates a new version. Anyone already on an older version keeps theirs until they choose to switch.'
                : 'Demo mode: no backend is connected, so plans are saved to this device only.'}
            </Txt>
          </View>
        </>
      )}
    </Screen>
  );
}

function ModePill() {
  const c = useTheme();
  const live = isBackendConfigured;
  return (
    <View
      accessibilityLabel={live ? 'Mode: connected, publishing to everyone' : 'Mode: demo, saving on this device'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: radius.pill, backgroundColor: live ? c.accentSoft : c.vitaminSoft }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: live ? c.accent : c.vitamin }} />
      <Txt v="caption" color={live ? c.accent : c.warn} style={{ fontWeight: '700' }}>
        {live ? 'Connected · publishes to everyone' : 'Demo · saves on this device'}
      </Txt>
    </View>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="caption" color={c.bg} style={{ fontWeight: '800' }}>
          {n}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Txt v="h3">{title}</Txt>
        {children}
      </View>
    </Row>
  );
}

function Banner({ tone, icon, children }: { tone: 'danger' | 'accent'; icon: IconName; children: ReactNode }) {
  const c = useTheme();
  const fg = tone === 'danger' ? c.danger : c.accent;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginTop: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: fg }}>
      <Icon name={icon} size={16} color={fg} />
      <Txt v="caption" selectable style={{ flex: 1, lineHeight: 18 }}>
        {children}
      </Txt>
    </View>
  );
}

function Count({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <View>
      <Txt v="numLg" color={color}>
        {n}
      </Txt>
      <Txt v="caption" dim={2}>
        {label}
      </Txt>
    </View>
  );
}

function PlanSummary({ plan }: { plan: MealPlan }) {
  const c = useTheme();
  const kcal = dayKcal(plan);
  const lo = kcal.length ? Math.min(...kcal) : 0;
  const hi = kcal.length ? Math.max(...kcal) : 0;
  const inBand = kcal.length > 0 && lo >= plan.band.min && hi <= plan.band.max;
  const meals = plan.days.reduce((s, d) => s + d.meals.length, 0);
  return (
    <Card style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3" style={{ flex: 1 }} numberOfLines={2}>
          {plan.name}
        </Txt>
        <Txt v="caption" dim={2}>
          {plan.id}
        </Txt>
      </Row>
      <Txt v="caption" dim={1}>
        {plan.band.min.toLocaleString()}–{plan.band.max.toLocaleString()} kcal band · {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'} · {meals} meals
      </Txt>
      <Row gap={6}>
        <Icon name={inBand ? I.check : I.info} size={13} color={inBand ? c.accent : c.warn} />
        <Txt v="caption" color={inBand ? c.accent : c.warn} style={{ fontWeight: '700' }}>
          Computed {lo === hi ? lo.toLocaleString() : `${lo.toLocaleString()}–${hi.toLocaleString()}`} kcal a day
          {inBand ? ', inside the band' : ', outside the band'}
        </Txt>
      </Row>
    </Card>
  );
}

function IssueGroup({ title, issues, tone, startOpen }: { title: string; issues: ImportIssue[]; tone: 'danger' | 'warn'; startOpen?: boolean }) {
  const c = useTheme();
  const [open, setOpen] = useState(!!startOpen);
  const fg = tone === 'danger' ? c.danger : c.warn;
  const bySheet = useMemo(() => {
    const m = new Map<string, ImportIssue[]>();
    for (const i of issues) m.set(i.sheet, [...(m.get(i.sheet) ?? []), i]);
    return [...m.entries()];
  }, [issues]);
  return (
    <Section title={`${title} · ${issues.length}`}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title}, ${issues.length}. ${open ? 'Collapse' : 'Expand'}`}
          onPress={() => {
            tap('select');
            setOpen(!open);
          }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fg }} />
          <Txt v="bodyStrong" style={{ flex: 1 }}>
            {issues.length} {issues.length === 1 ? title.slice(0, -1).toLowerCase() : title.toLowerCase()} in {bySheet.length} {bySheet.length === 1 ? 'sheet' : 'sheets'}
          </Txt>
          <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
            <Icon name={I.chevron} size={13} color={c.ink3} />
          </View>
        </Pressable>
        {open &&
          bySheet.map(([sheet, list]) => (
            <View key={sheet} style={{ borderTopWidth: 1, borderTopColor: c.line }}>
              <Txt v="label" dim={2} style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
                {sheet}
              </Txt>
              {list.map((i, idx) => (
                <View key={idx} style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md }}>
                  <View style={{ width: 3, borderRadius: 2, backgroundColor: fg }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt v="caption" style={{ lineHeight: 18 }} selectable>
                      {i.row > 0 && (
                        <Txt v="caption" color={fg} style={{ fontWeight: '800' }}>
                          Row {i.row}{'  '}
                        </Txt>
                      )}
                      {i.message}
                    </Txt>
                    {i.suggestion && (
                      <Txt v="caption" dim={1} style={{ lineHeight: 18 }} selectable>
                        {i.suggestion}
                      </Txt>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
      </Card>
    </Section>
  );
}
