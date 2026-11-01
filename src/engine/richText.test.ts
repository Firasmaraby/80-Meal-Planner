import { describe, expect, it } from 'vitest';

import { boldStats, markerCount, paragraphWords, parseRich, plainText } from './richText';

describe('parseRich', () => {
  it('splits paragraphs on blank lines, not single newlines', () => {
    const p = parseRich('One.\n\nTwo.\n  \n\nThree\nstill three.');
    expect(p.map((x) => x.map((s) => s.text).join(''))).toEqual(['One.', 'Two.', 'Three\nstill three.']);
    expect(parseRich('A.\r\n\r\nB.')).toHaveLength(2);
  });

  it('reads bold phrases into spans', () => {
    expect(parseRich('Eat **more fibre** today, and **sleep**.')).toEqual([
      [
        { text: 'Eat ', bold: false },
        { text: 'more fibre', bold: true },
        { text: ' today, and ', bold: false },
        { text: 'sleep', bold: true },
        { text: '.', bold: false },
      ],
    ]);
    expect(parseRich('**Cook once.** Eat twice.')[0]).toEqual([
      { text: 'Cook once.', bold: true },
      { text: ' Eat twice.', bold: false },
    ]);
  });

  it('shows an unbalanced marker literally and never drops text', () => {
    const odd = parseRich('Eat **more fibre and **less** salt **today');
    const flat = odd[0].map((s) => s.text).join('');
    expect(flat.replace(/\*\*/g, '')).toBe('Eat more fibre and less salt today');
    expect(parseRich('Hello **world')).toEqual([[{ text: 'Hello **world', bold: false }]]);
    expect(parseRich('**')).toEqual([[{ text: '**', bold: false }]]);
    expect(parseRich('a **** b')[0].map((s) => s.text).join('')).toBe('a **** b');
  });

  it('does not let bold run across a paragraph break', () => {
    const p = parseRich('Start **bold\n\nend** here');
    expect(p).toHaveLength(2);
    expect(p.flat().some((s) => s.bold)).toBe(false);
    expect(plainText('Start **bold\n\nend** here')).toBe('Start **bold end** here');
  });

  it('gives nothing for empty text', () => {
    expect(parseRich('')).toEqual([]);
    expect(parseRich('  \n\n  ')).toEqual([]);
    expect(parseRich(undefined)).toEqual([]);
    expect(parseRich(null)).toEqual([]);
    expect(plainText('')).toBe('');
    expect(plainText(undefined)).toBe('');
  });
});

describe('plainText', () => {
  it('strips markers and joins paragraphs with a space', () => {
    const text = '**Cook once, eat twice.** Monday makes two portions.\n\nFish on **Tuesday** and **Friday**.';
    const out = plainText(text);
    expect(out).toBe('Cook once, eat twice. Monday makes two portions. Fish on Tuesday and Friday.');
    expect(out).not.toContain('*');
    expect(out).not.toContain('\n');
  });

  it('leaves text without markers alone', () => {
    expect(plainText('Just a sentence.')).toBe('Just a sentence.');
  });
});

describe('helpers', () => {
  it('counts markers, words and bold phrases', () => {
    expect(markerCount('**a** b **c')).toBe(3);
    expect(markerCount('plain')).toBe(0);
    const [p] = parseRich('**One two three** and **four**');
    expect(paragraphWords(p)).toBe(5);
    expect(boldStats(p)).toEqual({ phrases: 2, longest: 3 });
  });
});
