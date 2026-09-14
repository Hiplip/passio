import { describe, expect, it } from "vitest";

import {
  ICON_SIZE,
  isDecoratable,
  iconPosition,
  listHeight,
  listPosition,
  LIST_WIDTH,
  type Box,
} from "./anchor";

const field: Box = { top: 100, left: 50, width: 300, height: 40 };
const viewport = { width: 1280, height: 800 };

describe("iconPosition", () => {
  it("centres the button vertically in the field", () => {
    const { top } = iconPosition(field);
    expect(top + ICON_SIZE / 2).toBe(field.top + field.height / 2);
  });

  it("keeps the button inside the field's right-hand end", () => {
    const { left } = iconPosition(field);
    expect(left).toBeGreaterThan(field.left);
    expect(left + ICON_SIZE).toBeLessThanOrEqual(field.left + field.width);
  });
});

describe("listPosition", () => {
  it("sits below the field when there is room", () => {
    const { top } = listPosition(field, viewport, 200);
    expect(top).toBeGreaterThan(field.top + field.height);
  });

  it("flips above the field when there is not", () => {
    // A list running off the bottom of the window is unreachable.
    const low: Box = { ...field, top: 700 };
    const { top } = listPosition(low, viewport, 200);
    expect(top + 200).toBeLessThanOrEqual(low.top);
  });

  it("never leaves the top of the window", () => {
    const tall: Box = { ...field, top: 10 };
    const { top } = listPosition(tall, viewport, 600);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it("keeps the list on screen at the right edge", () => {
    const edge: Box = { ...field, left: 1250 };
    const { left, width } = listPosition(edge, viewport, 200);
    expect(left + width).toBeLessThanOrEqual(viewport.width);
  });

  it("narrows to fit a small window rather than overflowing", () => {
    const { width } = listPosition(field, { width: 200, height: 600 }, 200);
    expect(width).toBeLessThanOrEqual(200);
    expect(width).toBeLessThan(LIST_WIDTH);
  });
});

describe("isDecoratable", () => {
  it("accepts an ordinary field", () => {
    expect(isDecoratable(field, viewport)).toBe(true);
  });

  it("refuses a field too narrow for the button", () => {
    expect(isDecoratable({ ...field, width: 20 }, viewport)).toBe(false);
  });

  it("refuses a field too short for the button", () => {
    expect(isDecoratable({ ...field, height: 4 }, viewport)).toBe(false);
  });

  it("refuses a field scrolled out of view", () => {
    expect(isDecoratable({ ...field, top: -500 }, viewport)).toBe(false);
    expect(isDecoratable({ ...field, top: 5000 }, viewport)).toBe(false);
  });

  it("refuses a zero-sized field", () => {
    // The same instinct as never filling a hidden field: when unsure, do nothing.
    expect(isDecoratable({ top: 0, left: 0, width: 0, height: 0 }, viewport)).toBe(false);
  });
});

describe("listHeight", () => {
  it("is a single notice when nothing matches", () => {
    // Locked, or no saved login: one line of text, not an empty sheet.
    expect(listHeight(0)).toBeLessThan(60);
    expect(listHeight(-1)).toBe(listHeight(0));
  });

  it("grows with the number of matches", () => {
    expect(listHeight(2)).toBeGreaterThan(listHeight(1));
    expect(listHeight(3)).toBeGreaterThan(listHeight(2));
  });

  it("stops growing so it cannot cover the page", () => {
    // Past a few entries the list scrolls internally instead. A transparent
    // iframe the height of the viewport swallows every click behind it.
    expect(listHeight(50)).toBe(listHeight(4));
    expect(listHeight(50)).toBeLessThan(250);
  });
});
