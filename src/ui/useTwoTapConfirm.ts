import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Inline "tap again to confirm". The first press arms it, a second press within `timeoutMs` runs `onConfirm`,
 * and it disarms by itself after the timeout. Works where a native or browser dialog is not an option.
 */
export function useTwoTapConfirm(onConfirm: () => void, timeoutMs = 4000) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const press = useCallback(() => {
    clearTimeout(timer.current);
    if (armed) {
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), timeoutMs);
  }, [armed, onConfirm, timeoutMs]);

  return { armed, press };
}
