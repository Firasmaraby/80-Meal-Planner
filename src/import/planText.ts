/**
 * Plain-text meal-plan importer: the three CSV blocks an AI writes (PLANS, MEALS, INGREDIENTS)
 * are turned into an in-memory workbook and handed to `parsePlanWorkbook`, so the validation
 * is exactly the same as for an uploaded .xlsx. Row numbers in the issues are CSV line numbers
 * within each block (the header line is row 1; blank lines count).
 *
 * Tolerated: ```csv fences, markdown before/after, blank lines, trailing spaces, ';' or tab as
 * delimiter, quoted fields (RFC 4180, including embedded newlines), `=== NAME ===`, `NAME:`,
 * `## NAME` and "```csv NAME" headers, and (when there are no markers at all) blocks recognised
 * by their header row.
 *
 * Pure TypeScript, no React Native / DOM: runs in the admin screen, the CLI and node tests.
 */
import * as XLSX from 'xlsx';
import type { MealPlan } from '../engine/types';
import { parsePlanWorkbook, type FoodResolver, type ImportIssue, type ImportResult } from './planWorkbook';

type BlockName = 'plans' | 'meals' | 'ingredients';

const BLOCKS: { key: BlockName; sheet: string; marker: string; header: string[]; isHeader: (norm: string) => boolean }[] = [
  {
    key: 'plans',
    sheet: 'Plans',
    marker: 'PLANS',
    header: ['plan_id', 'plan_name', 'calorie_min', 'calorie_max', 'cuisine', 'tags', 'description', 'author', 'version'],
    isHeader: (n) => n.includes('plan_name'),
  },
  {
    key: 'meals',
    sheet: 'Meals',
    marker: 'MEALS',
    header: ['plan_id', 'day', 'slot', 'meal_id', 'meal_name', 'prep_minutes', 'instructions', 'photo_url'],
    isHeader: (n) => n.includes('meal_id') && n.includes('slot'),
  },
  {
    key: 'ingredients',
    sheet: 'Ingredients',
    marker: 'INGREDIENTS',
    header: ['meal_id', 'food_id', 'food_name', 'grams', 'swap_group', 'note'],
    isHeader: (n) => n.includes('grams') && n.includes('meal_id'),
  },
];

const NAME_WORDS = /^(plans|meals|ingredients)(\s+(sheet|block|csv|table|data|section))*$/i;
const normLine = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '_');

// ── block finding ───────────────────────────────────────────────────────────

/** `=== PLANS ===`, `PLANS:`, `## Plans`, `**MEALS**`, `--- ingredients ---`; a bare word is not enough. */
function markerName(line: string): BlockName | undefined {
  const t = line.trim();
  if (!t || t.length > 60) return undefined;
  const core = t.replace(/^[\s#>*_=\-`~[(]+/, '').replace(/[\s*_=\-`~:\])]+$/, '');
  if (core === t) return undefined;
  const m = NAME_WORDS.exec(core);
  return m ? (m[1].toLowerCase() as BlockName) : undefined;
}

interface RawBlock {
  name: BlockName;
  lines: string[];
}

function findBlocks(text: string): RawBlock[] {
  const lines = text.split('\n');
  const hasMarkers = lines.some((l) => markerName(l) || (/^\s*```/.test(l) && fenceName(l)));
  const out: RawBlock[] = [];
  let cur: RawBlock | null = null;
  let inFence = false;
  const start = (name: BlockName) => {
    cur = { name, lines: [] };
    out.push(cur);
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (!inFence) {
        inFence = true;
        const named = fenceName(line);
        if (named) start(named);
      } else {
        inFence = false;
        cur = null; // a closing fence ends the block
      }
      continue;
    }
    const marker = markerName(line);
    if (marker) {
      start(marker);
      continue;
    }
    if (!hasMarkers) {
      // no markers at all: recognise blocks by their header row
      const n = normLine(line);
      const hit = [...BLOCKS].reverse().find((b) => b.isHeader(n) && /[,;\t]/.test(line));
      if (hit) start(hit.key);
    }
    if (cur) (cur as RawBlock).lines.push(line);
  }
  return out;
}

function fenceName(line: string): BlockName | undefined {
  const m = /\b(plans|meals|ingredients)\b/i.exec(line.replace(/^\s*```/, ''));
  return m ? (m[1].toLowerCase() as BlockName) : undefined;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

interface CsvRecord {
  fields: string[];
  /** 0-based line (within the block text) where the record starts */
  line: number;
}

interface CsvParse {
  records: CsvRecord[];
  /** char index of a quote that opens a field and is never closed */
  unterminated?: number;
}

function parseCsv(text: string, delim: string, literalQuotes: Set<number>): CsvParse {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let openAt = -1;
  let line = 0;
  let recStart = 0;

  const endField = () => {
    fields.push(field);
    field = '';
    afterQuote = false;
  };
  const endRecord = () => {
    endField();
    if (fields.some((f) => f.trim() !== '')) records.push({ fields, line: recStart });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && !afterQuote && field.trim() === '' && !literalQuotes.has(i)) {
      inQuotes = true;
      openAt = i;
      field = '';
    } else if (ch === delim) {
      endField();
    } else if (ch === '\n') {
      endRecord();
      line++;
      recStart = line;
    } else {
      field += ch;
    }
  }
  if (inQuotes) return { records, unterminated: openAt };
  endRecord();
  return { records };
}

function detectDelimiter(headerLine: string): string {
  let best = ',';
  let bestN = 0;
  for (const d of [',', ';', '\t']) {
    const n = headerLine.split(d).length - 1;
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length - 1;

interface ParsedBlock {
  /** rows by sheet row number - 1; blank lines are empty arrays so row = line within the block */
  aoa: string[][];
}

function parseBlock(def: (typeof BLOCKS)[number], raw: RawBlock, issues: ImportIssue[]): ParsedBlock | undefined {
  const text = raw.lines.join('\n');
  if (text.trim() === '') return undefined;

  const headerLine = raw.lines.find((l) => def.isHeader(normLine(l))) ?? raw.lines.find((l) => l.trim() !== '')!;
  const headerIdx = raw.lines.indexOf(headerLine);
  const delim = detectDelimiter(headerLine);

  let parsed = parseCsv(text, delim, new Set());
  const literal = new Set<number>();
  for (let guard = 0; parsed.unterminated !== undefined && guard < 20; guard++) {
    const at = parsed.unterminated;
    issues.push({
      level: 'error',
      sheet: def.sheet,
      row: Math.max(1, lineOf(text, at) - headerIdx + 1),
      message: 'A quoted field starts here but is never closed.',
      suggestion: 'Close the quote, and double any quote inside a field ("").',
    });
    literal.add(at);
    parsed = parseCsv(text, delim, literal);
  }

  let records = parsed.records;
  // skip prose before the header
  const hi = records.findIndex((r) => def.isHeader(normLine(r.fields.join(','))));
  records = records.slice(hi < 0 ? 0 : hi);
  if (!records.length) return undefined;
  const header = records[0];
  const cols = header.fields.length;

  // unfenced prose after the last row ("Let me know if…") is not data
  const minFields = Math.ceil(cols / 2);
  const ignored: CsvRecord[] = [];
  while (records.length > 1 && records[records.length - 1].fields.length < minFields) ignored.unshift(records.pop()!);
  if (ignored.length) {
    const first = ignored[0];
    issues.push({
      level: 'warning',
      sheet: def.sheet,
      row: first.line - header.line + 1,
      message: `Ignored text after the last row: "${first.fields.join(' ').trim().slice(0, 60)}".`,
    });
  }

  // tags may be separated by "|" (the format we ask for); the workbook importer splits on , and ;
  const tagsCol = def.key === 'plans' ? header.fields.findIndex((h) => normLine(h.trim()) === 'tags') : -1;

  const aoa: string[][] = [];
  for (const rec of records) {
    const row = rec.line - header.line + 1;
    // fields beyond the header: usually an unquoted comma inside a field, which shifts every column
    const extra = rec.fields.slice(cols).filter((f) => f.trim() !== '');
    if (extra.length && rec !== header) {
      issues.push({
        level: 'error',
        sheet: def.sheet,
        row,
        message: `This row has ${cols + extra.length} fields but the header has ${cols}.`,
        suggestion: 'Put double quotes around any field that contains a comma (or use | between tags).',
      });
    }
    while (aoa.length < row - 1) aoa.push([]);
    aoa[row - 1] = rec.fields.slice(0, cols).map((f, i) => (i === tagsCol && rec !== header ? f.replace(/\|/g, ';') : f).trim());
  }
  return { aoa };
}

// ── import ──────────────────────────────────────────────────────────────────

export function parsePlanText(text: string, resolver: FoodResolver, opts?: { autoAcceptScore?: number }): ImportResult {
  const clean = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const issues: ImportIssue[] = [];
  if (clean.trim() === '') {
    return { plans: [], issues: [{ level: 'error', sheet: 'Workbook', row: 1, message: 'Nothing to import: the text is empty.' }] };
  }

  const raw = findBlocks(clean);
  const wb = XLSX.utils.book_new();
  let missing = false;

  for (const def of BLOCKS) {
    const candidates = raw.filter((b) => b.name === def.key);
    const parsedAll = candidates.map((b) => ({ b, probe: b.lines.some((l) => def.isHeader(normLine(l))) }));
    const ordered = [...parsedAll.filter((c) => c.probe), ...parsedAll.filter((c) => !c.probe)];
    let chosen: ParsedBlock | undefined;
    let used = -1;
    const blockIssues: ImportIssue[] = [];
    for (let k = 0; k < ordered.length && !chosen; k++) {
      chosen = parseBlock(def, ordered[k].b, blockIssues);
      used = k;
    }
    if (!chosen) {
      missing = true;
      const sample = def.header.join(',');
      issues.push({
        level: 'error',
        sheet: def.sheet,
        row: 1,
        message: candidates.length ? `The ${def.marker} block is empty.` : `No ${def.marker} block found.`,
        suggestion: `Start it with the line "=== ${def.marker} ===" and then the header row ${sample}.`,
      });
      continue;
    }
    issues.push(...blockIssues);
    if (ordered.filter((c, k) => k !== used && c.b.lines.some((l) => l.trim() !== '')).length) {
      issues.push({ level: 'warning', sheet: def.sheet, row: 1, message: `The ${def.marker} block appears more than once; only one copy was used.` });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chosen.aoa), def.sheet);
  }

  if (missing) return { plans: [], issues };

  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const result = parsePlanWorkbook(data, resolver, opts);
  return { plans: result.plans, issues: [...issues, ...result.issues] };
}

// ── export ──────────────────────────────────────────────────────────────────

const csvField = (v: string | number | undefined): string => {
  const s = v === undefined ? '' : String(v);
  return /[",;\t\n\r]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLine = (cells: (string | number | undefined)[]) => cells.map(csvField).join(',');

/**
 * The plans as the three CSV blocks an AI is asked to write. Importing the result gives the same
 * plans back. `foodName` fills the readable food_name column (food_id still decides the match).
 */
export function plansToText(plans: MealPlan[], opts?: { foodName?: (foodId: string) => string | undefined }): string {
  const [pDef, mDef, iDef] = BLOCKS;
  const p: string[] = [`=== ${pDef.marker} ===`, pDef.header.join(',')];
  const m: string[] = [`=== ${mDef.marker} ===`, mDef.header.join(',')];
  const g: string[] = [`=== ${iDef.marker} ===`, iDef.header.join(',')];
  for (const plan of plans) {
    p.push(csvLine([plan.id, plan.name, plan.band.min, plan.band.max, plan.cuisine, plan.tags.join('|'), plan.description, plan.author, plan.version]));
    for (const day of plan.days) {
      for (const meal of day.meals) {
        m.push(csvLine([plan.id, day.day, meal.slot, meal.id, meal.name, meal.prepMinutes, meal.instructions, meal.photoUrl]));
        for (const ing of meal.ingredients) {
          g.push(csvLine([meal.id, ing.foodId, opts?.foodName?.(ing.foodId), ing.grams, ing.swapGroup, ing.note]));
        }
      }
    }
  }
  return [p.join('\n'), m.join('\n'), g.join('\n')].join('\n\n') + '\n';
}
