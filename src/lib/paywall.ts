/**
 * Paywall logic: packages, pricing copy, the free-trial timeline and membership status.
 * Pure (no React Native imports) so it can be tested in node.
 */

// TODO: replace these placeholders with the real Terms and Privacy pages before launch.
export const TERMS_URL = 'https://eighty.app/terms';
export const PRIVACY_URL = 'https://eighty.app/privacy';

export type PackageId = 'annual' | 'monthly';

export type Package = {
  id: PackageId;
  priceString: string;
  price: number;
  currency: string;
  period: 'year' | 'month';
  trialDays: number | null;
};

export const DEMO_PACKAGES: Package[] = [
  { id: 'annual', priceString: '$59.99', price: 59.99, currency: 'CAD', period: 'year', trialDays: 7 },
  { id: 'monthly', priceString: '$9.99', price: 9.99, currency: 'CAD', period: 'month', trialDays: 7 },
];

export type Platform = 'ios' | 'android' | 'web';

export type Membership = {
  status: 'none' | 'trial' | 'active' | 'expired';
  plan?: PackageId;
  /** YYYY-MM-DD */
  startedOn?: string;
  /** YYYY-MM-DD. For a trial this is the day the free week ends and billing starts. */
  renewsOn?: string;
  source: 'demo' | 'store';
};

export const NO_MEMBERSHIP: Membership = { status: 'none', source: 'demo' };

const periodWord = (pkg: Pick<Package, 'period'>) => (pkg.period === 'year' ? 'a year' : 'a month');

/** "$59.99 a year" */
export function priceLine(pkg: Package): string {
  return `${pkg.priceString} ${periodWord(pkg)}`;
}

/** "$5.00 a month" for a yearly package; a monthly one just reads "$9.99 a month". */
export function perMonthString(pkg: Package): string {
  if (pkg.period === 'month') return `${pkg.priceString} a month`;
  const m = /^(\D*)([\d.,\s]*\d)(.*)$/.exec(pkg.priceString);
  const amount = (Math.round((pkg.price / 12) * 100) / 100).toFixed(2);
  if (!m) return `${amount} a month`;
  // keep the same symbol (and its side) as the price string
  return `${m[1]}${amount}${m[3]} a month`;
}

/** Whole percent saved by paying yearly. Always rounds down, so we never overstate it. */
export function savingsPct(annual: Package, monthly: Package): number {
  const pct = Math.floor((1 - annual.price / (monthly.price * 12)) * 100);
  return Math.max(0, pct);
}

export type TimelineKey = 'today' | 'reminder' | 'charge';
export type TimelineStep = { day: number; date: Date; key: TimelineKey };

const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function trialTimeline(start: Date, trialDays: number): TimelineStep[] {
  const reminderDay = Math.max(1, trialDays - 2);
  return [
    { day: 0, date: plusDays(start, 0), key: 'today' },
    { day: reminderDay, date: plusDays(start, reminderDay), key: 'reminder' },
    { day: trialDays, date: plusDays(start, trialDays), key: 'charge' },
  ];
}

export function ctaLabel(pkg: Package): string {
  if (pkg.trialDays == null) return 'Subscribe';
  if (pkg.trialDays === 7) return 'Start my free week';
  return `Start my ${pkg.trialDays}-day free trial`;
}

/** The short line under the button: "Free for 7 days, then $59.99 a year". */
export function priceCaption(pkg: Package): string {
  return pkg.trialDays == null ? priceLine(pkg) : `Free for ${pkg.trialDays} days, then ${priceLine(pkg)}`;
}

const WHERE: Record<Platform, string> = {
  ios: 'Settings > Apple ID > Subscriptions',
  android: 'Google Play > Subscriptions',
  web: 'your app store account',
};

export function legalLine(pkg: Package, platform: Platform): string {
  const where = WHERE[platform];
  if (pkg.trialDays == null) {
    return `${priceLine(pkg)}. Renews automatically until you cancel. Cancel anytime in ${where}, at least 24 hours before it renews.`;
  }
  return `${priceCaption(pkg)}. Renews automatically until you cancel. Cancel anytime in ${where}, at least 24 hours before the trial ends.`;
}

// ── Dates (YYYY-MM-DD strings, no time zones involved) ─────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parse(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Add whole months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
function addMonths(date: string, n: number): string {
  const [y, m, d] = parse(date);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = idx % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

/** Add days to a YYYY-MM-DD string. */
export function addDaysTo(date: string, n: number): string {
  const [y, m, d] = parse(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "Nov 9", or "Nov 9, 2027" with the year. Deterministic, no locale needed. */
export function shortDate(date: string, withYear = false): string {
  const [y, m, d] = parse(date);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

/** Same as shortDate, for a Date object in local time. */
export function shortDateOf(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** The first renewal on or after `today`, stepping from `from` by one period at a time. */
function nextRenewal(from: string, plan: PackageId, today: string): string {
  const step = plan === 'annual' ? 12 : 1;
  let next = from;
  let n = 0;
  while (next < today && n < 600) {
    n += 1;
    next = addMonths(from, step * n);
  }
  return next;
}

/**
 * Does this membership unlock the app?
 * A demo trial counts as converted once the week is over, like a real store would bill.
 * A store membership needs a renewal date that is not in the past.
 */
export function isEntitled(m: Membership, today: string): boolean {
  if (m.status !== 'trial' && m.status !== 'active') return false;
  if (m.source === 'demo') return true;
  return !!m.renewsOn && m.renewsOn >= today;
}

/** "Free week, ends Nov 16" · "Annual, renews Nov 9, 2027" · "Monthly, renews Dec 9" */
export function membershipLine(m: Membership, today?: string): string {
  if (m.status === 'none') return 'No membership yet';
  if (m.status === 'expired') return 'Membership ended';
  const name = m.plan === 'annual' ? 'Annual' : m.plan === 'monthly' ? 'Monthly' : 'Member';
  const withYear = m.plan === 'annual';
  let renews = m.renewsOn;
  if (m.status === 'trial' && renews && (!today || today <= renews)) {
    return `Free week, ends ${shortDate(renews)}`;
  }
  if (renews && m.plan && today) renews = nextRenewal(renews, m.plan, today);
  return renews ? `${name}, renews ${shortDate(renews, withYear)}` : name;
}
