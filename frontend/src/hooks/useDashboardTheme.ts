import { useCallback, useSyncExternalStore } from "react";

/**
 * Scoped light/dark theme for the STUDENT, TEACHER and ADMIN dashboards only.
 *
 * Deliberately NOT a global next-themes/<html> toggle: the public marketing
 * site (Home, course catalog, etc.) must always stay in its light brand look.
 * Instead each dashboard root conditionally adds a `dark` class to its own
 * subtree, so the dark palette is contained to the dashboard the user is in.
 *
 * State lives in a tiny module-level store (not React context) so the three
 * dashboards + every toggle instance share one preference and stay in sync,
 * without having to wrap the router in a provider. It persists to
 * localStorage so the choice survives reloads.
 */

export type DashboardTheme = "light" | "dark";

const STORAGE_KEY = "vrr-dashboard-theme";

function readInitial(): DashboardTheme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

let currentTheme: DashboardTheme = readInitial();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): DashboardTheme {
  return currentTheme;
}

/** Imperative setter usable outside React (and by the hook below). */
export function setDashboardTheme(next: DashboardTheme) {
  if (next === currentTheme) return;
  currentTheme = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage may be unavailable (private mode) — keep in-memory state */
  }
  emit();
}

export function useDashboardTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light" as DashboardTheme);

  const toggle = useCallback(() => {
    setDashboardTheme(currentTheme === "dark" ? "light" : "dark");
  }, []);

  const setTheme = useCallback((t: DashboardTheme) => setDashboardTheme(t), []);

  return { theme, isDark: theme === "dark", toggle, setTheme } as const;
}
