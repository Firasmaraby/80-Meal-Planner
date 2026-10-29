import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Alert, Platform, Pressable, Share, TextInput, View } from 'react-native';

import { fixListForAI, gradePlan, HARD_NUTRIENTS, RULES, type DayReport, type PlanReport, type ReportIssue } from '@/engine/planReport';
import type { MealPlan } from '@/engine/types';
import { parsePlanText, plansToText } from '@/import/planText';
import { parsePlanWorkbook, type ImportIssue, type ImportResult } from '@/import/planWorkbook';
import { uploadPlans } from '@/lib/plansRepo';
import { isBackendConfigured } from '@/lib/supabase';
import { BUNDLED_PLANS, food, FOOD_INDEX, FOODS, foodResolver } from '@/state/catalog';
import { useStore } from '@/state/store';
import { Button, Card, Icon, I, IconButton, type IconName, Row, Screen, Section, Txt, tap } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';
import { MicroChip } from '@/ui/viz';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TEMPLATE_PATH = 'templates/MealPlan_Template.xlsx';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });

type Mode = 'xlsx' | 'paste';

interface Report {
  /** file name, or "Pasted text" */
  label: string;
  plans: MealPlan[];
  issues: ImportIssue[];
  /** one framework report per imported plan */
  reports: PlanReport[];
}

/** the sample plan as the AI should write it, with readable food names */
const sampleText = () => plansToText(BUNDLED_PLANS.slice(0, 1), { foodName: (id) => food(id)?.name });

/**
 * Copies on web (clipboard API), opens the share sheet on native (no clipboard module is installed).
 * 'manual' means the caller should show the text selected so it can be copied by hand.
 */
async function copyText(text: string): Promise<'copied' | 'shared' | 'cancelled' | 'manual'> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return 'copied';
      }
      return 'manual';
    }
    const res = await Share.share({ message: text });
    return res.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch {
    return 'manual';
  }
}

type Tone = 'good' | 'watch' | 'over' | 'none';

/** same good / watch / over idea as the pillars on the Today screen */
function dayTones(d: DayReport, band: { min: number; max: number }): Record<'kcal' | 'protein' | 'satFat' | 'omega' | 'gl', Tone> {
  const atMost = (x: number | undefined, t: number): Tone => (x == null ? 'none' : x <= t ? 'good' : x <= t * 1.25 ? 'watch' : 'over');
  return {
    kcal: d.kcal >= band.min && d.kcal <= band.max ? 'good' : 'over',
    protein: d.proteinPctKcal >= RULES.proteinMinPctKcal ? 'good' : d.proteinPctKcal >= RULES.proteinMinPctKcal * 0.8 ? 'watch' : 'over',
    satFat: atMost(d.satFatPct, RULES.satFatMaxPct),
    omega: atMost(d.omegaRatio, RULES.omegaMaxRatio),
    gl: atMost(d.glycemicLoad, RULES.glycemicLoadMax),
  };
}

const frameworkWarnings = (reports: PlanReport[]) => reports.reduce((n, r) => n + r.issues.filter((i) => i.level !== 'info').length, 0);

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
  const [mode, setMode] = useState<Mode>('xlsx');
  const [pasted, setPasted] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<'read' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [manual, setManual] = useState<{ title: string; text: string } | null>(null);

  const errors = useMemo(() => report?.issues.filter((i) => i.level === 'error') ?? [], [report]);
  const warnings = useMemo(() => report?.issues.filter((i) => i.level === 'warning') ?? [], [report]);
  const ready = !!report && errors.length === 0 && report.plans.length > 0;
  const needWork = report?.reports.filter((r) => !r.pass).length ?? 0;
  const fixList = useMemo(() => (report ? fixListForAI({ reports: report.reports, importIssues: report.issues }) : ''), [report]);

  const reset = () => {
    setError(null);
    setDone(null);
    setManual(null);
  };

  const finish = (label: string, result: ImportResult) => {
    setReport({ label, plans: result.plans, issues: result.issues, reports: result.plans.map((p) => gradePlan(p, FOOD_INDEX, FOODS)) });
  };

  const copy = async (what: string, text: string) => {
    reset();
    const how = await copyText(text);
    if (how === 'manual') setManual({ title: what, text });
    else if (how !== 'cancelled') {
      tap('success');
      setDone(how === 'copied' ? `${what} copied. Paste it into your AI chat.` : `${what} ready to share. Choose Copy or your AI app.`);
    }
  };

  const importPasted = () => {
    reset();
    try {
      finish('Pasted text', parsePlanText(pasted, foodResolver));
    } catch (e) {
      setReport(null);
      setError(`Couldn’t read that text. ${e instanceof Error ? e.message : ''}`.trim());
    }
  };

  const choose = async () => {
    reset();
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: [XLSX_MIME, 'application/vnd.ms-excel'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setBusy('read');
      // on web the asset carries a File; on native a file:// uri. fetch handles both.
      const buffer = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
      finish(asset.name, parsePlanWorkbook(buffer, foodResolver));
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
    const fw = frameworkWarnings(report.reports);
    confirmAction(
      'Publish to everyone?',
      `${report.plans.length} ${report.plans.length === 1 ? 'plan goes' : 'plans go'} live for every user as a new version. Published versions can’t be edited.` +
        (fw > 0 ? `\n\nPublishing with ${fw} framework ${fw === 1 ? 'warning' : 'warnings'}.` : ''),
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
            Upload an Excel template, or paste a plan written by an AI. Nutrition is never typed in: it’s computed from the food database, so every plan is held to the same numbers.
          </Txt>
          <ModeSwitch mode={mode} onChange={(m) => { setMode(m); reset(); }} />
        </View>
      }>
      {mode === 'xlsx' ? (
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
      ) : (
        <Card style={{ gap: space.lg }}>
          <Step n={1} title="Ask your AI for the plan">
            <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
              Give it your brief and ask it to answer with three CSV blocks: === PLANS ===, === MEALS === and === INGREDIENTS ===. Fences, notes around the blocks and ; as separator are fine.
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy sample as AI text"
              hitSlop={8}
              onPress={() => copy('Sample', sampleText())}
              style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}>
              <Txt v="caption" color={c.accent} style={{ fontWeight: '700', textDecorationLine: 'underline' }}>
                Copy sample as AI text
              </Txt>
            </Pressable>
          </Step>
          <Step n={2} title="Paste its answer">
            <TextInput
              value={pasted}
              onChangeText={setPasted}
              multiline
              numberOfLines={14}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textAlignVertical="top"
              placeholder={'=== PLANS ===\nplan_id,plan_name,calorie_min,…'}
              placeholderTextColor={c.ink3}
              accessibilityLabel="Meal plan text written by the AI"
              style={{
                minHeight: 14 * 18 + 2 * space.md,
                padding: space.md,
                borderRadius: radius.md,
                backgroundColor: c.surface2,
                color: c.ink,
                fontFamily: MONO,
                fontSize: 12,
                lineHeight: 18,
              }}
            />
            <Button label="Import" icon={I.upload} disabled={busy != null || pasted.trim() === ''} onPress={importPasted} />
          </Step>
        </Card>
      )}

      {manual && <ManualCopy title={manual.title} text={manual.text} onClose={() => setManual(null)} />}

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
          <Section title={`Report · ${report.label}`}>
            <Card style={{ gap: space.md }}>
              <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
                <Count n={report.plans.length} label={report.plans.length === 1 ? 'plan' : 'plans'} />
                <Count n={errors.length} label={errors.length === 1 ? 'error' : 'errors'} color={errors.length ? c.danger : c.ink3} />
                <Count n={warnings.length} label={warnings.length === 1 ? 'warning' : 'warnings'} color={warnings.length ? c.warn : c.ink3} />
                <Count n={needWork} label="need work" color={needWork ? c.warn : c.ink3} />
              </Row>
              <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
                {errors.length > 0
                  ? mode === 'paste'
                    ? 'Send the fix-list back to the AI and paste its corrected answer. Nothing is saved until the text is clean.'
                    : 'Fix the errors in the sheet and upload it again. Nothing is saved until the file is clean.'
                  : report.plans.length === 0
                    ? 'No plans found in this file.'
                    : warnings.length > 0 || needWork > 0
                      ? 'Good to go. The warnings and framework gaps are worth a look but won’t block the upload.'
                      : 'Clean. Every plan passes the framework.'}
              </Txt>
              <Button label="Copy fix-list for the AI" icon={I.upload} onPress={() => copy('Fix-list', fixList)} />
              <FixListPreview text={fixList} />
            </Card>
          </Section>

          {report.reports.length > 0 && (
            <Section title="Framework report">
              <View style={{ gap: space.sm }}>
                {report.reports.map((r) => (
                  <PlanReportCard key={r.planId} report={r} />
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

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const c = useTheme();
  const options: { key: Mode; label: string }[] = [
    { key: 'xlsx', label: 'Upload .xlsx' },
    { key: 'paste', label: 'Paste from AI' },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignSelf: 'stretch', padding: 3, borderRadius: radius.pill, backgroundColor: c.surface2, marginTop: space.xs }}>
      {options.map((o) => {
        const active = mode === o.key;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              tap('select');
              onChange(o.key);
            }}
            style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: active ? c.ink : 'transparent' }}>
            <Txt v="caption" color={active ? c.bg : c.ink2} style={{ fontWeight: '700' }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** web fallback when the clipboard is blocked: the text sits selected in a read-only box, ready for Ctrl/Cmd+C */
function ManualCopy({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const c = useTheme();
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.setSelection(0, text.length);
    }, 50);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <Card style={{ gap: space.sm, marginTop: space.lg }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">Copy the {title.toLowerCase()} by hand</Txt>
        <IconButton icon={I.close} label="Close" onPress={onClose} />
      </Row>
      <Txt v="caption" dim={1} style={{ lineHeight: 18 }}>
        The browser blocked automatic copying. The text is selected below: press Ctrl+C (Cmd+C on a Mac).
      </Txt>
      <TextInput
        ref={ref}
        value={text}
        multiline
        readOnly
        selectTextOnFocus
        accessibilityLabel={`${title} text, selected for copying`}
        style={{ maxHeight: 220, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface2, color: c.ink, fontFamily: MONO, fontSize: 12, lineHeight: 18 }}
      />
    </Card>
  );
}

function FixListPreview({ text }: { text: string }) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Fix-list preview. ${open ? 'Collapse' : 'Expand'}`}
        onPress={() => {
          tap('select');
          setOpen(!open);
        }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name={I.chevron} size={12} color={c.ink3} />
        </View>
        <Txt v="caption" dim={1} style={{ fontWeight: '700' }}>
          Preview fix-list
        </Txt>
      </Pressable>
      {open && (
        <View style={{ marginTop: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface2 }}>
          <Txt v="caption" selectable style={{ fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
            {text}
          </Txt>
        </View>
      )}
    </View>
  );
}

const TABLE_COLS = [
  { key: 'day', label: 'Day', flex: 0.7 },
  { key: 'kcal', label: 'kcal', flex: 1.1 },
  { key: 'protein', label: 'Protein', flex: 1.1 },
  { key: 'satFat', label: 'Sat fat', flex: 1.1 },
  { key: 'omega', label: 'Ω 6:3', flex: 1.2 },
  { key: 'gl', label: 'GL', flex: 0.9 },
  { key: 'fish', label: 'Fish', flex: 0.8 },
] as const;

function PlanReportCard({ report }: { report: PlanReport }) {
  const c = useTheme();
  const tone = (t: Tone) => (t === 'good' ? c.accent : t === 'over' ? c.danger : t === 'watch' ? c.warn : c.ink3);
  const gaps = report.days.filter((d) => d.under80.length > 0);
  const hasHard = gaps.some((d) => d.under80.some((u) => HARD_NUTRIENTS.includes(u.key)));
  const fishLow = report.issues.some((i) => i.code === 'fish_low');
  return (
    <Card style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3" numberOfLines={2}>
            {report.planName}
          </Txt>
          <Txt v="caption" dim={1}>
            {report.planId} · {report.band.min.toLocaleString()}–{report.band.max.toLocaleString()} kcal band · {report.days.length} {report.days.length === 1 ? 'day' : 'days'}
          </Txt>
        </View>
        <View
          accessibilityLabel={report.pass ? 'Passes the framework' : 'Needs work'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 28, borderRadius: radius.pill, backgroundColor: report.pass ? c.accentSoft : c.vitaminSoft }}>
          <Icon name={report.pass ? I.check : I.info} size={12} color={report.pass ? c.accent : c.warn} />
          <Txt v="caption" color={report.pass ? c.accent : c.warn} style={{ fontWeight: '800' }}>
            {report.pass ? 'Passes' : 'Needs work'}
          </Txt>
        </View>
      </Row>

      <View>
        <Row gap={4} style={{ paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
          {TABLE_COLS.map((col) => (
            <Txt key={col.key} v="caption" dim={2} style={{ flex: col.flex, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
              {col.label}
            </Txt>
          ))}
        </Row>
        {report.days.map((d) => {
          const t = dayTones(d, report.band);
          const cells: { key: string; text: string; tone: Tone }[] = [
            { key: 'day', text: String(d.day), tone: 'none' },
            { key: 'kcal', text: Math.round(d.kcal).toLocaleString(), tone: t.kcal },
            { key: 'protein', text: `${Math.round(d.proteinPctKcal)}%`, tone: t.protein },
            { key: 'satFat', text: d.satFatPct == null ? '—' : `${d.satFatPct.toFixed(1)}%`, tone: t.satFat },
            { key: 'omega', text: d.omegaRatio == null ? '—' : `${d.omegaRatio.toFixed(1)}:1`, tone: t.omega },
            { key: 'gl', text: String(Math.round(d.glycemicLoad)), tone: t.gl },
            { key: 'fish', text: String(d.fattyFishMeals), tone: 'none' },
          ];
          const label = `Day ${d.day}: ${cells
            .slice(1, 6)
            .map((x, i) => `${TABLE_COLS[i + 1].label} ${x.text}, ${x.tone === 'good' ? 'ok' : x.tone === 'none' ? 'no data' : x.tone === 'watch' ? 'close to the limit' : 'outside the target'}`)
            .join('; ')}; fatty fish meals ${d.fattyFishMeals}`;
          return (
            <View key={d.day} accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.line }}>
              {cells.map((cell, i) => (
                <Txt
                  key={cell.key}
                  v="num"
                  numberOfLines={1}
                  color={cell.key === 'day' ? c.ink2 : tone(cell.tone)}
                  style={{ flex: TABLE_COLS[i].flex, fontSize: 13, fontWeight: cell.tone === 'good' || cell.tone === 'none' ? '500' : '800' }}>
                  {cell.text}
                </Txt>
              ))}
            </View>
          );
        })}
        <Txt v="caption" dim={2} style={{ fontSize: 11, lineHeight: 16, marginTop: 6 }}>
          kcal against {report.band.min.toLocaleString()}–{report.band.max.toLocaleString()} · protein share of kcal (aim ≥ {RULES.proteinMinPctKcal}%) · sat fat max {RULES.satFatMaxPct}% · omega 6:3 aim ≤ {RULES.omegaMaxRatio}:1 · glycemic load aim ≤ {RULES.glycemicLoadMax} · fish = meals with fatty fish ({report.fishPerWeek.toFixed(1)} a week{fishLow ? ', aim ≥ 2' : ''}). Bold colour means close to or past the limit.
        </Txt>
      </View>

      <View style={{ gap: space.sm }}>
        <Txt v="label" dim={2}>
          Under 80% of target
        </Txt>
        {gaps.length === 0 ? (
          <Txt v="caption" color={c.accent} style={{ fontWeight: '700' }}>
            Every day reaches 80% of every nutrient.
          </Txt>
        ) : (
          gaps.map((d) => (
            <View key={d.day} style={{ gap: 4 }}>
              <Txt v="caption" dim={1} style={{ fontWeight: '700' }}>
                Day {d.day}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {d.under80.map((u) => (
                  <MicroChip key={u.key} k={u.key} pct={u.pct} />
                ))}
              </View>
            </View>
          ))
        )}
        {hasHard && (
          <Txt v="caption" dim={2} style={{ lineHeight: 16 }}>
            Vitamin D, iodine and biotin are hard to reach from food alone; they are listed but never hold a plan back.
          </Txt>
        )}
      </View>

      <FrameworkIssues issues={report.issues} />
    </Card>
  );
}

const ISSUE_GROUPS: { title: string; codes: ReportIssue['code'][] }[] = [
  { title: 'Calories', codes: ['kcal_low', 'kcal_high'] },
  { title: 'Fats and glycemic load', codes: ['sat_fat_high', 'omega_high', 'gl_high'] },
  { title: 'Protein', codes: ['protein_low'] },
  { title: 'Fatty fish', codes: ['fish_low'] },
  { title: 'Nutrients under 80%', codes: ['micro_low'] },
  { title: 'Hard to get from food', codes: ['micro_low_hard'] },
];

function FrameworkIssues({ issues }: { issues: ReportIssue[] }) {
  const c = useTheme();
  const groups = ISSUE_GROUPS.map((g) => ({ ...g, list: issues.filter((i) => g.codes.includes(i.code)) })).filter((g) => g.list.length > 0);
  if (groups.length === 0) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Txt v="label" dim={2}>
        Issues
      </Txt>
      {groups.map((g) => (
        <FrameworkIssueGroup key={g.title} title={g.title} list={g.list} startOpen={g.codes[0] !== 'micro_low' && g.codes[0] !== 'micro_low_hard'} color={g.list.some((i) => i.level === 'error') ? c.danger : g.list.some((i) => i.level === 'warning') ? c.warn : c.ink3} />
      ))}
    </View>
  );
}

function FrameworkIssueGroup({ title, list, color, startOpen }: { title: string; list: ReportIssue[]; color: string; startOpen: boolean }) {
  const c = useTheme();
  const [open, setOpen] = useState(startOpen);
  return (
    <View style={{ borderRadius: radius.md, backgroundColor: c.surface2, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${list.length}. ${open ? 'Collapse' : 'Expand'}`}
        onPress={() => {
          tap('select');
          setOpen(!open);
        }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Txt v="caption" style={{ flex: 1, fontWeight: '700' }}>
          {title} · {list.length}
        </Txt>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name={I.chevron} size={12} color={c.ink3} />
        </View>
      </Pressable>
      {open &&
        list.map((i, idx) => (
          <View key={idx} style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.line, gap: 2 }}>
            <Txt v="caption" selectable style={{ lineHeight: 18 }}>
              {i.message}
            </Txt>
            {i.fix && (
              <Txt v="caption" dim={1} selectable style={{ lineHeight: 18 }}>
                Fix: {i.fix}
              </Txt>
            )}
          </View>
        ))}
    </View>
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
