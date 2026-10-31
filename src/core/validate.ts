import { match } from 'path-to-regexp';
import { ValidationError } from './errors.js';
import type { DeviceInfo, DisplaySpec, PanelSpec, ScreenDefinition, ThemeSpec } from './types.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIRECTIONS = new Set(['left', 'right', 'above', 'below', 'within']);
const ROTATIONS = new Set([0, 90, 180, 270]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) throw new ValidationError('expected an object', path);
  return value;
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'string') throw new ValidationError('expected a string', path);
}

function optionalNumber(value: unknown, path: string, min = -Infinity, max = Infinity): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`expected a number between ${min} and ${max}`, path);
  }
}

function optionalBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'boolean') throw new ValidationError('expected a boolean', path);
}

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function expectId(value: unknown, path: string): void {
  if (!isValidId(value)) throw new ValidationError('expected an id (letters, digits, . _ : -; max 128)', path);
}

export function validateTheme(input: unknown, path = 'theme'): ThemeSpec {
  const theme = expectObject(input, path);
  optionalString(theme.base, `${path}.base`);
  optionalString(theme.className, `${path}.className`);
  optionalNumber(theme.gap, `${path}.gap`, 0, 200);
  if (theme.colorScheme !== undefined && theme.colorScheme !== 'light' && theme.colorScheme !== 'dark') {
    throw new ValidationError('expected "light" or "dark"', `${path}.colorScheme`);
  }
  if (theme.variables !== undefined) {
    const vars = expectObject(theme.variables, `${path}.variables`);
    for (const [name, value] of Object.entries(vars)) {
      if (!/^--[A-Za-z0-9_-]+$/.test(name)) throw new ValidationError('CSS variables must start with --', `${path}.variables.${name}`);
      if (typeof value !== 'string') throw new ValidationError('expected a string', `${path}.variables.${name}`);
    }
  }
  return theme as ThemeSpec;
}

export function validateDisplay(input: unknown, path = 'display'): DisplaySpec {
  const display = expectObject(input, path);
  for (const key of ['fullscreen', 'wakeLock', 'locked', 'hideTabs'] as const) optionalBoolean(display[key], `${path}.${key}`);
  optionalNumber(display.scale, `${path}.scale`, 0.05, 20);
  optionalString(display.background, `${path}.background`);
  if (display.rotation !== undefined && !ROTATIONS.has(display.rotation as number)) {
    throw new ValidationError('expected 0, 90, 180 or 270', `${path}.rotation`);
  }
  if (display.fit !== undefined && !['contain', 'fill', 'none'].includes(display.fit as string)) {
    throw new ValidationError('expected "contain", "fill" or "none"', `${path}.fit`);
  }
  if (display.cursor !== undefined && display.cursor !== 'auto' && display.cursor !== 'none') {
    throw new ValidationError('expected "auto" or "none"', `${path}.cursor`);
  }
  if (display.resolution !== undefined) {
    const res = expectObject(display.resolution, `${path}.resolution`);
    optionalNumber(res.width, `${path}.resolution.width`, 1, 100_000);
    optionalNumber(res.height, `${path}.resolution.height`, 1, 100_000);
    if (res.width === undefined || res.height === undefined) throw new ValidationError('width and height are required', `${path}.resolution`);
  }
  return display as DisplaySpec;
}

function validatePanel(input: unknown, path: string): PanelSpec {
  const panel = expectObject(input, path);
  expectId(panel.id, `${path}.id`);
  if (typeof panel.component !== 'string' || panel.component === '') throw new ValidationError('expected a component name', `${path}.component`);
  optionalString(panel.title, `${path}.title`);
  optionalString(panel.tabComponent, `${path}.tabComponent`);
  optionalNumber(panel.initialWidth, `${path}.initialWidth`, 0);
  optionalNumber(panel.initialHeight, `${path}.initialHeight`, 0);
  if (panel.params !== undefined) expectObject(panel.params, `${path}.params`);
  if (panel.position !== undefined) {
    const position = expectObject(panel.position, `${path}.position`);
    optionalString(position.referencePanel, `${path}.position.referencePanel`);
    if (position.direction !== undefined && !DIRECTIONS.has(position.direction as string)) {
      throw new ValidationError('expected left, right, above, below or within', `${path}.position.direction`);
    }
  }
  return panel as unknown as PanelSpec;
}

/**
 * Checks that untrusted input is a screen definition. Returns the same object
 * typed, or throws a {@link ValidationError} naming the faulty field.
 */
export function validateScreen(input: unknown, path = 'screen'): ScreenDefinition {
  const screen = expectObject(input, path);
  expectId(screen.id, `${path}.id`);
  optionalString(screen.title, `${path}.title`);
  optionalString(screen.updatedAt, `${path}.updatedAt`);
  optionalNumber(screen.version, `${path}.version`, 0);
  if (screen.route !== undefined && (typeof screen.route !== 'string' || !screen.route.startsWith('/'))) {
    throw new ValidationError('expected a path starting with /', `${path}.route`);
  }
  if (screen.route !== undefined) {
    try {
      match(screen.route as string);
    } catch (error) {
      throw new ValidationError(`invalid route pattern (${(error as Error).message})`, `${path}.route`);
    }
  }
  if (screen.panels !== undefined) {
    if (!Array.isArray(screen.panels)) throw new ValidationError('expected an array', `${path}.panels`);
    const ids = new Set<string>();
    screen.panels.forEach((panel, index) => {
      const spec = validatePanel(panel, `${path}.panels[${index}]`);
      if (ids.has(spec.id)) throw new ValidationError(`duplicate panel id "${spec.id}"`, `${path}.panels[${index}].id`);
      ids.add(spec.id);
    });
  }
  if (screen.layout !== undefined) {
    const layout = expectObject(screen.layout, `${path}.layout`);
    expectObject(layout.grid, `${path}.layout.grid`);
    expectObject(layout.panels, `${path}.layout.panels`);
  }
  if (screen.theme !== undefined) validateTheme(screen.theme, `${path}.theme`);
  if (screen.display !== undefined) validateDisplay(screen.display, `${path}.display`);
  if (screen.meta !== undefined) expectObject(screen.meta, `${path}.meta`);
  return screen as unknown as ScreenDefinition;
}

export function validateDeviceInfo(input: unknown, path = 'device'): DeviceInfo {
  const device = expectObject(input, path);
  expectId(device.id, `${path}.id`);
  optionalString(device.name, `${path}.name`);
  optionalString(device.kind, `${path}.kind`);
  if (device.tags !== undefined && (!Array.isArray(device.tags) || device.tags.some((t) => typeof t !== 'string'))) {
    throw new ValidationError('expected an array of strings', `${path}.tags`);
  }
  return device as unknown as DeviceInfo;
}
