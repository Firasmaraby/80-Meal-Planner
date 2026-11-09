import { describe, expect, it } from 'vitest';

import {
  DEMO_PACKAGES,
  addDaysTo,
  ctaLabel,
  isEntitled,
  legalLine,
  membershipLine,
  perMonthString,
  priceCaption,
  savingsPct,
  shortDate,
  trialTimeline,
  type Membership,
  type Package,
} from './paywall';

const [annual, monthly] = DEMO_PACKAGES;

describe('demo packages', () => {
  it('lists yearly first, both with a 7 day trial', () => {
    expect(DEMO_PACKAGES.map((p) => p.id)).toEqual(['annual', 'monthly']);
    expect(DEMO_PACKAGES.every((p) => p.trialDays === 7)).toBe(true);
    expect(annual.priceString).toBe('$59.99');
    expect(monthly.priceString).toBe('$9.99');
  });
});

describe('perMonthString', () => {
  it('shows the yearly price per month to the cent', () => {
    expect(perMonthString(annual)).toBe('$5.00 a month');
  });
  it('keeps the symbol of the price string', () => {
    expect(perMonthString({ ...annual, priceString: '£71.88', price: 71.88 })).toBe('£5.99 a month');
    expect(perMonthString({ ...annual, priceString: '59,99 €', price: 59.99 })).toBe('5.00 € a month');
  });
  it('reads plainly for a monthly package', () => {
    expect(perMonthString(monthly)).toBe('$9.99 a month');
  });
});

describe('savingsPct', () => {
  it('is 49 for the demo prices and never rounds up', () => {
    // 1 - 59.99 / 119.88 = 49.96%
    expect(savingsPct(annual, monthly)).toBe(49);
  });
  it('floors small and exact values', () => {
    expect(savingsPct({ ...annual, price: 60 }, { ...monthly, price: 10 })).toBe(50);
    expect(savingsPct({ ...annual, price: 119.99 }, monthly)).toBe(0);
  });
  it('never goes negative', () => {
    expect(savingsPct({ ...annual, price: 200 }, monthly)).toBe(0);
  });
});

describe('trialTimeline', () => {
  const start = new Date(2026, 10, 9); // Nov 9 2026
  it('has today, a reminder two days before the end, and the first charge', () => {
    const t = trialTimeline(start, 7);
    expect(t.map((s) => [s.key, s.day])).toEqual([
      ['today', 0],
      ['reminder', 5],
      ['charge', 7],
    ]);
    expect(t[0].date).toEqual(new Date(2026, 10, 9));
    expect(t[1].date).toEqual(new Date(2026, 10, 14));
    expect(t[2].date).toEqual(new Date(2026, 10, 16));
  });
  it('crosses month and year ends', () => {
    const t = trialTimeline(new Date(2026, 11, 29), 7);
    expect(t[2].date).toEqual(new Date(2027, 0, 5));
  });
  it('does not mutate the start date', () => {
    const s = new Date(2026, 10, 9);
    trialTimeline(s, 7);
    expect(s).toEqual(new Date(2026, 10, 9));
  });
  it('copes with a short trial', () => {
    expect(trialTimeline(start, 3).map((s) => s.day)).toEqual([0, 1, 3]);
  });
});

describe('ctaLabel', () => {
  it('says free week for 7 days', () => expect(ctaLabel(annual)).toBe('Start my free week'));
  it('names other trial lengths', () => {
    expect(ctaLabel({ ...annual, trialDays: 14 })).toBe('Start my 14-day free trial');
    expect(ctaLabel({ ...annual, trialDays: 3 })).toBe('Start my 3-day free trial');
  });
  it('is Subscribe with no trial', () => expect(ctaLabel({ ...annual, trialDays: null })).toBe('Subscribe'));
});

describe('legalLine and priceCaption', () => {
  it('matches the Android wording', () => {
    expect(legalLine(annual, 'android')).toBe(
      'Free for 7 days, then $59.99 a year. Renews automatically until you cancel. Cancel anytime in Google Play > Subscriptions, at least 24 hours before the trial ends.',
    );
  });
  it('uses Apple wording on iOS and a generic place on web', () => {
    expect(legalLine(monthly, 'ios')).toContain('Free for 7 days, then $9.99 a month.');
    expect(legalLine(monthly, 'ios')).toContain('Settings > Apple ID > Subscriptions');
    expect(legalLine(monthly, 'web')).toContain('in your app store account,');
  });
  it('drops the trial words when there is no trial', () => {
    const p: Package = { ...annual, trialDays: null };
    expect(legalLine(p, 'ios')).toBe(
      '$59.99 a year. Renews automatically until you cancel. Cancel anytime in Settings > Apple ID > Subscriptions, at least 24 hours before it renews.',
    );
    expect(priceCaption(p)).toBe('$59.99 a year');
  });
  it('captions the selection', () => {
    expect(priceCaption(annual)).toBe('Free for 7 days, then $59.99 a year');
    expect(priceCaption(monthly)).toBe('Free for 7 days, then $9.99 a month');
  });
});

describe('dates', () => {
  it('formats without a locale', () => {
    expect(shortDate('2026-11-16')).toBe('Nov 16');
    expect(shortDate('2027-11-09', true)).toBe('Nov 9, 2027');
    expect(shortDate('2026-01-05')).toBe('Jan 5');
  });
  it('adds days across boundaries', () => {
    expect(addDaysTo('2026-11-09', 7)).toBe('2026-11-16');
    expect(addDaysTo('2026-12-29', 7)).toBe('2027-01-05');
    expect(addDaysTo('2028-02-27', 2)).toBe('2028-02-29');
  });
});

describe('isEntitled', () => {
  const T = '2026-11-20';
  const m = (x: Partial<Membership>): Membership => ({ status: 'trial', source: 'demo', ...x });
  it('is false for none and expired', () => {
    expect(isEntitled(m({ status: 'none' }), T)).toBe(false);
    expect(isEntitled(m({ status: 'expired', renewsOn: '2027-01-01' }), T)).toBe(false);
  });
  it('lets a demo trial or active membership in, even after the trial week', () => {
    expect(isEntitled(m({ renewsOn: '2026-11-16' }), T)).toBe(true);
    expect(isEntitled(m({ status: 'active', renewsOn: '2026-11-16' }), T)).toBe(true);
    expect(isEntitled(m({ renewsOn: undefined }), T)).toBe(true);
  });
  it('needs a current renewal date from the store', () => {
    expect(isEntitled(m({ source: 'store', renewsOn: '2026-11-20' }), T)).toBe(true);
    expect(isEntitled(m({ source: 'store', status: 'active', renewsOn: '2026-11-21' }), T)).toBe(true);
    expect(isEntitled(m({ source: 'store', renewsOn: '2026-11-19' }), T)).toBe(false);
    expect(isEntitled(m({ source: 'store', status: 'active' }), T)).toBe(false);
  });
});

describe('membershipLine', () => {
  it('describes a free week', () => {
    expect(membershipLine({ status: 'trial', plan: 'annual', startedOn: '2026-11-09', renewsOn: '2026-11-16', source: 'demo' }, '2026-11-10')).toBe(
      'Free week, ends Nov 16',
    );
  });
  it('describes annual and monthly renewals', () => {
    expect(membershipLine({ status: 'active', plan: 'annual', renewsOn: '2027-11-09', source: 'store' })).toBe('Annual, renews Nov 9, 2027');
    expect(membershipLine({ status: 'active', plan: 'monthly', renewsOn: '2026-12-09', source: 'store' })).toBe('Monthly, renews Dec 9');
  });
  it('rolls a finished demo trial forward to its next renewal', () => {
    const base = { status: 'trial', startedOn: '2026-11-09', renewsOn: '2026-11-16', source: 'demo' } as const;
    expect(membershipLine({ ...base, plan: 'monthly' }, '2026-11-20')).toBe('Monthly, renews Dec 16');
    expect(membershipLine({ ...base, plan: 'annual' }, '2026-11-20')).toBe('Annual, renews Nov 16, 2027');
  });
  it('clamps month ends when rolling forward', () => {
    expect(membershipLine({ status: 'active', plan: 'monthly', renewsOn: '2026-01-31', source: 'demo' }, '2026-02-10')).toBe('Monthly, renews Feb 28');
  });
  it('handles none and expired', () => {
    expect(membershipLine({ status: 'none', source: 'demo' })).toBe('No membership yet');
    expect(membershipLine({ status: 'expired', plan: 'annual', source: 'store' })).toBe('Membership ended');
  });
});
