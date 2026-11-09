/**
 * The purchases layer. The paywall and the You tab only talk to `purchases`.
 * RevenueCat (react-native-purchases) replaces the demo implementation below, in this one file.
 */
import Constants from 'expo-constants';

import { useStore, today } from '@/state/store';

import { scheduleTrialReminder } from './reminders';
import { DEMO_PACKAGES, addDaysTo, isEntitled, type Package, type PackageId, type Platform } from './paywall';

export type PurchaseResult = { ok: true } | { ok: false; cancelled?: boolean; message: string };
export type RestoreResult = { restored: boolean; message: string };

export interface Purchases {
  getPackages(): Promise<Package[]>;
  purchase(id: PackageId): Promise<PurchaseResult>;
  restore(): Promise<RestoreResult>;
  /** Where the person manages or cancels. Null when there is no such page (web). */
  manageUrl(platform: Platform): string | null;
}

export const demoPurchases: Purchases = {
  async getPackages() {
    return DEMO_PACKAGES;
  },

  async purchase(id) {
    useStore.getState().startMembership(id);
    const m = useStore.getState().membership;
    if (m.renewsOn) {
      // two days before the free week ends, around 10 in the morning
      const [y, mo, d] = addDaysTo(m.renewsOn, -2).split('-').map(Number);
      void scheduleTrialReminder(new Date(y, mo - 1, d, 10, 0));
    }
    return { ok: true };
  },

  async restore() {
    const { membership } = useStore.getState();
    if (isEntitled(membership, today())) return { restored: true, message: 'Your membership is active.' };
    return { restored: false, message: 'Nothing to restore on this account.' };
  },

  manageUrl(platform) {
    if (platform === 'ios') return 'https://apps.apple.com/account/subscriptions';
    if (platform === 'android') {
      const pkg = Constants.expoConfig?.android?.package;
      const base = 'https://play.google.com/store/account/subscriptions';
      return pkg ? `${base}?package=${encodeURIComponent(pkg)}` : base;
    }
    return null;
  },
};

// RevenueCat replaces this line (and the demo above) with a react-native-purchases implementation.
export const purchases: Purchases = demoPurchases;
export const IS_DEMO_PURCHASES = true;

