import { useSyncExternalStore } from "react";

// Demo mode swaps every live Grail / app-function call for built-in sample data
// (see ./resolver.ts and ./fixtures/*). It is persisted in localStorage and can
// be forced on/off with ?demo=1 / ?demo=0 in the URL.

const STORAGE_KEY = "sre-maturity-demo-mode";
const listeners = new Set<() => void>();

function readInitial(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("demo");
    if (param === "1" || param === "true") {
      window.localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (param === "0" || param === "false") {
      window.localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let current = readInitial();

export function isDemoMode(): boolean {
  return current;
}

export function setDemoMode(value: boolean): void {
  if (value === current) return;
  current = value;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — keep in-memory value */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribe, isDemoMode, isDemoMode);
}
