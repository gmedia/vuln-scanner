export const THEMES = ["dark", "light"] as const;
export type AppTheme = (typeof THEMES)[number];

export const DEFAULT_THEME: AppTheme = "dark";
export const THEME_STORAGE_KEY = "sinexis.theme";

const themeListeners = new Set<() => void>();

export function subscribeTheme(onStoreChange: () => void): () => void {
  themeListeners.add(onStoreChange);
  return () => {
    themeListeners.delete(onStoreChange);
  };
}

export function emitThemeChange(): void {
  themeListeners.forEach((fn) => {
    fn();
  });
}

export const THEME_COLOR: Record<AppTheme, string> = {
  dark: "#0a0a0a",
  light: "#fafafa",
};

export function isAppTheme(
  value: string | null | undefined,
): value is AppTheme {
  return value === "dark" || value === "light";
}

export function readStoredTheme(): AppTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function persistTheme(theme: AppTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    void 0;
  }
  emitThemeChange();
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_COLOR[theme]);
  }
}

export function resolveTheme(): AppTheme {
  return readStoredTheme() ?? DEFAULT_THEME;
}
