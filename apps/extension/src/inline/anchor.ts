export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Diameter of the in-field button, and the gap it keeps from the field's edge. */
export const ICON_SIZE = 20;
const ICON_INSET = 6;

/** Width of the suggestion list, and how far it sits from the field. */
export const LIST_WIDTH = 260;
const LIST_GAP = 4;

/**
 * Where the button sits: vertically centred at the right-hand end of the field.
 *
 * Positions are viewport coordinates for a `position: fixed` element rather
 * than offsets inside the page's own layout. Injecting a positioned child into
 * someone else's form breaks on any site with `overflow: hidden`, a transformed
 * ancestor, or its own absolutely positioned decorations - which is most of
 * them.
 */
export function iconPosition(field: Box): { top: number; left: number } {
  return {
    top: field.top + (field.height - ICON_SIZE) / 2,
    left: field.left + field.width - ICON_SIZE - ICON_INSET,
  };
}

/**
 * Where the suggestion list sits: below the field, or above it when there is
 * not enough room below.
 *
 * A list that runs off the bottom of the window is unreachable, and a password
 * manager that puts its suggestions somewhere you cannot click is worse than
 * one with no suggestions at all.
 */
export function listPosition(
  field: Box,
  viewport: Viewport,
  listHeight: number,
): { top: number; left: number; width: number } {
  const below = field.top + field.height + LIST_GAP;
  const fitsBelow = below + listHeight <= viewport.height;
  const top = fitsBelow ? below : Math.max(LIST_GAP, field.top - LIST_GAP - listHeight);

  const width = Math.min(LIST_WIDTH, viewport.width - LIST_GAP * 2);
  // Keep it on screen even when the field is at the very edge.
  const left = Math.max(
    LIST_GAP,
    Math.min(field.left, viewport.width - width - LIST_GAP),
  );

  return { top, left, width };
}

/** A field too small or off-screen to decorate. Matches the rule that already
 *  refuses hidden fields: when unsure, do nothing. */
export function isDecoratable(field: Box, viewport: Viewport): boolean {
  if (field.width < ICON_SIZE * 2 || field.height < ICON_SIZE) return false;
  if (field.top + field.height < 0 || field.top > viewport.height) return false;
  if (field.left + field.width < 0 || field.left > viewport.width) return false;
  return true;
}
