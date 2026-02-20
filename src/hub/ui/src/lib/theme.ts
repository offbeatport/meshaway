export type Appearance = "light" | "dark" | "system";

const STORAGE_KEY = "meshaway-appearance";

function getSystemDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getStoredAppearance(): Appearance {
  if (typeof window === "undefined") return "dark";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "dark";
}

export function setStoredAppearance(value: Appearance): void {
  localStorage.setItem(STORAGE_KEY, value);
  applyAppearance(value);
}

export function applyAppearance(value: Appearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = value === "dark" || (value === "system" && getSystemDark());
  if (isDark) root.classList.add("dark");
  else root.classList.remove("dark");
}

export function subscribeToSystemPreference(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => callback();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
