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

/**
 * The list matches the field's width and left edge.
 *
 * A fixed width floating near the input is what makes an overlay look bolted
 * on; aligning it to the field is most of why Bitwarden's reads as part of the
 * page. The minimum stops a very narrow field producing a list too small to
 * show a username.
 */
export const MIN_LIST_WIDTH = 220;
const LIST_GAP = 4;

const ROW_HEIGHT = 44;
const LIST_HEADER = 27;
const LIST_PADDING = 10;
const NOTICE_HEIGHT = 46;
const MAX_ROWS = 4;

/**
 * A first-paint estimate, replaced the moment the iframe measures itself.
 *
 * Sizing matters because the iframe is transparent: empty space below a short
 * list is an invisible sheet over the page that swallows clicks meant for
 * whatever is underneath. An estimate alone was never going to be right - a
 * notice that wraps to two lines does not fit a one-line box - so the iframe
 * reports its real height and this only avoids a flash at the wrong size.
 */
export function listHeight(matchCount: number): number {
  if (matchCount <= 0) return NOTICE_HEIGHT;
  const rows = Math.min(matchCount, MAX_ROWS);
  return LIST_HEADER + rows * ROW_HEIGHT + LIST_PADDING;
}

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

  const available = viewport.width - LIST_GAP * 2;
  const width = Math.min(Math.max(field.width, MIN_LIST_WIDTH), available);
  // Aligned to the field's left edge, but kept on screen when the field sits at
  // the very edge of a narrow window.
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
