import * as dockview from 'dockview';
import type { DockviewTheme } from 'dockview';
import type { ThemeSpec } from '../core/types.js';

/**
 * Every `themeXxx` exported by dockview is registered as `xxx` (camelCase):
 * `dark`, `light`, `abyss`, `dracula`, `nord`, `githubDark`… New themes of
 * future dockview versions are picked up automatically.
 */
const themes = new Map<string, DockviewTheme>();
for (const [key, value] of Object.entries(dockview)) {
  if (!key.startsWith('theme') || key.length <= 5) continue;
  const theme = value as Partial<DockviewTheme> | undefined;
  if (theme && typeof theme === 'object' && typeof theme.className === 'string') {
    themes.set(key[5]!.toLowerCase() + key.slice(6), theme as DockviewTheme);
  }
}

/** Registers (or replaces) a named dockview theme usable as `theme.base`. */
export function registerTheme(name: string, theme: DockviewTheme): void {
  themes.set(name, theme);
}

export function getTheme(name: string): DockviewTheme | undefined {
  return themes.get(name);
}

export function themeNames(): string[] {
  return [...themes.keys()];
}

/** Turns a portable {@link ThemeSpec} into the dockview theme object. */
export function resolveTheme(spec: ThemeSpec | undefined, fallback = 'dark'): DockviewTheme {
  const base = themes.get(spec?.base ?? fallback) ?? themes.get(fallback) ?? themes.get('dark') ?? { name: 'dark', className: 'dockview-theme-dark' };
  return {
    ...base,
    ...(spec?.colorScheme ? { colorScheme: spec.colorScheme } : {}),
    ...(spec?.gap !== undefined ? { gap: spec.gap } : {}),
  };
}
