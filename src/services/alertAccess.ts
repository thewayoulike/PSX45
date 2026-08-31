/**
 * Tiny shared store for "is this user allowed to save alerts?".
 *
 * App.tsx owns the real answer (`!!driveUser || !!sbUser`), but deeply nested
 * widgets like the chart's alert dialog would otherwise need the flag drilled
 * through several unrelated components, so it is published here instead.
 */

type Listener = (canSave: boolean) => void;

let canSaveAlerts = false;
const listeners = new Set<Listener>();

export const setCanSaveAlerts = (next: boolean) => {
  if (next === canSaveAlerts) return;
  canSaveAlerts = next;
  listeners.forEach((fn) => fn(next));
};

export const getCanSaveAlerts = () => canSaveAlerts;

export const subscribeCanSaveAlerts = (fn: Listener) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
