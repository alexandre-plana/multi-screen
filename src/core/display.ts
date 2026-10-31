import type { DisplaySpec, ThemeSpec } from './types.js';

/** Merges display layers; later layers win field by field. */
export function mergeDisplay(...layers: (DisplaySpec | undefined | null)[]): DisplaySpec {
  const result: DisplaySpec = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/** Merges theme layers; variables are merged, other fields replaced. */
export function mergeTheme(...layers: (ThemeSpec | undefined | null)[]): ThemeSpec | undefined {
  let result: ThemeSpec | undefined;
  for (const layer of layers) {
    if (!layer) continue;
    const variables = { ...result?.variables, ...layer.variables };
    result = { ...result, ...layer };
    if (Object.keys(variables).length > 0) result.variables = variables;
  }
  return result;
}

export interface StageGeometry {
  /** Size given to the layout (CSS px, before transform). */
  width: number;
  height: number;
  /** Scale applied horizontally / vertically. */
  scaleX: number;
  scaleY: number;
  rotation: number;
  /** CSS transform to apply on the stage (origin: top left). */
  transform: string;
}

/**
 * Pure computation of how a screen is fitted inside a viewport, given a
 * display spec. Kept separate from the DOM so it can be unit tested.
 */
export function computeStage(viewport: { width: number; height: number }, display: DisplaySpec): StageGeometry {
  const rotation = display.rotation ?? 0;
  const quarter = rotation === 90 || rotation === 270;
  // Space available for the un-rotated stage.
  const availW = quarter ? viewport.height : viewport.width;
  const availH = quarter ? viewport.width : viewport.height;
  const manual = display.scale ?? 1;
  let width = availW / manual;
  let height = availH / manual;
  let scaleX = manual;
  let scaleY = manual;
  const res = display.resolution;
  if (res) {
    width = res.width;
    height = res.height;
    const fit = display.fit ?? 'contain';
    if (fit === 'contain') {
      const s = Math.min(availW / res.width, availH / res.height) * manual;
      scaleX = scaleY = s;
    } else if (fit === 'fill') {
      scaleX = (availW / res.width) * manual;
      scaleY = (availH / res.height) * manual;
    }
  }
  const scaledW = width * scaleX;
  const scaledH = height * scaleY;
  // Centre the stage, then rotate around its centre.
  const offsetX = (viewport.width - (quarter ? scaledH : scaledW)) / 2;
  const offsetY = (viewport.height - (quarter ? scaledW : scaledH)) / 2;
  const parts = [`translate(${round(offsetX)}px, ${round(offsetY)}px)`];
  if (rotation) {
    const cx = (quarter ? scaledH : scaledW) / 2;
    const cy = (quarter ? scaledW : scaledH) / 2;
    parts.push(`translate(${round(cx)}px, ${round(cy)}px)`, `rotate(${rotation}deg)`, `translate(${round(-scaledW / 2)}px, ${round(-scaledH / 2)}px)`);
  }
  if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${round(scaleX, 5)}, ${round(scaleY, 5)})`);
  return { width: round(width), height: round(height), scaleX, scaleY, rotation, transform: parts.join(' ') };
}

function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
