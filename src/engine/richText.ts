/**
 * The tiny rich text the app's authored copy may use (howItWorks, about, tip): paragraphs split by a blank line and
 * **bold phrases**. Nothing else. Pure, so the UI, the plan lab and the tests share one reading of it.
 */

export interface RichSpan {
  text: string;
  bold: boolean;
}
export type RichParagraph = RichSpan[];

const MARK = '**';

/** One paragraph into spans. A `**` with no closing `**` (or an empty pair) stays as literal text, so nothing is hidden. */
function parseParagraph(para: string): RichParagraph {
  const spans: RichSpan[] = [];
  const push = (text: string, bold: boolean) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.bold === bold) last.text += text;
    else spans.push({ text, bold });
  };
  let i = 0;
  while (i < para.length) {
    const open = para.indexOf(MARK, i);
    if (open < 0) break;
    const close = para.indexOf(MARK, open + MARK.length);
    const inner = close < 0 ? '' : para.slice(open + MARK.length, close);
    if (close < 0 || !inner.trim()) {
      // unbalanced or empty: keep the markers as plain text and carry on after them
      push(para.slice(i, open + MARK.length), false);
      i = open + MARK.length;
      continue;
    }
    push(para.slice(i, open), false);
    push(inner, true);
    i = close + MARK.length;
  }
  push(para.slice(i), false);
  return spans;
}

/** Paragraphs (split on blank lines) of spans. Empty or blank text gives no paragraphs. */
export function parseRich(text: string | null | undefined): RichParagraph[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(parseParagraph);
}

/** The text without markers, paragraphs joined by a space: for one-line places and accessibility labels. */
export function plainText(text: string | null | undefined): string {
  return parseRich(text)
    .map((p) => p.map((s) => s.text).join(''))
    .join(' ');
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Words in a paragraph as read (markers excluded). */
export function paragraphWords(p: RichParagraph): number {
  return wordCount(p.map((s) => s.text).join(''));
}

/** How many `**` a text holds, counted the way the parser reads them. Odd means one is unbalanced. */
export function markerCount(text: string): number {
  return text.split(MARK).length - 1;
}

/** Number of bold phrases and the word count of the longest, per paragraph. */
export function boldStats(p: RichParagraph): { phrases: number; longest: number } {
  const bold = p.filter((s) => s.bold);
  return { phrases: bold.length, longest: Math.max(0, ...bold.map((s) => wordCount(s.text))) };
}
