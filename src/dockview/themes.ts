import {
  themeAbyss, themeAbyssSpaced, themeCatppuccinMocha, themeCatppuccinMochaSpaced, themeDark, themeDracula,
  themeGithubDark, themeGithubDarkSpaced, themeGithubLight, themeGithubLightSpaced, themeLight, themeLightSpaced,
  themeMonokai, themeNord, themeNordSpaced, themeSolarizedLight, themeSolarizedLightSpaced, themeVisualStudio,
  type DockviewTheme,
} from 'dockview-core';
import type { ThemeSpec } from '../core/types.js';

const themes = new Map<string, DockviewTheme>(
  Object.entries({
    dark: themeDark,
    light: themeLight,
    lightSpaced: themeLightSpaced,
    visualStudio: themeVisualStudio,
    abyss: themeAbyss,
    abyssSpaced: themeAbyssSpaced,
    dracula: themeDracula,
    nord: themeNord,
    nordSpaced: themeNordSpaced,
    catppuccinMocha: themeCatppuccinMocha,
    catppuccinMochaSpaced: themeCatppuccinMochaSpaced,
    monokai: themeMonokai,
    solarizedLight: themeSolarizedLight,
    solarizedLightSpaced: themeSolarizedLightSpaced,
    githubDark: themeGithubDark,
    githubDarkSpaced: themeGithubDarkSpaced,
    githubLight: themeGithubLight,
    githubLightSpaced: themeGithubLightSpaced,
  }),
);

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
  const base = themes.get(spec?.base ?? fallback) ?? themes.get(fallback) ?? themeDark;
  return {
    ...base,
    ...(spec?.colorScheme ? { colorScheme: spec.colorScheme } : {}),
    ...(spec?.gap !== undefined ? { gap: spec.gap } : {}),
  };
}
