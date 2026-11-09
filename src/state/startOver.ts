import { useHealthStore } from './healthStore';
import { useKitchen } from './kitchenStore';
import { useStore } from './store';
import { useWellness } from './wellnessStore';

/** Wipes everything this app keeps on the device, so the next launch starts at the welcome step. */
export function startOver() {
  useStore.getState().resetAll();
  useWellness.getState().resetWellness();
  useKitchen.getState().reset();
  useHealthStore.getState().reset();
}
