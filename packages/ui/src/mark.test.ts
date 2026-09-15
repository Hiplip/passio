import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DIAL_HUB, DIAL_ROTATIONS, DIAL_SEGMENT } from "./mark";

/**
 * The mark exists twice, and the two copies must not drift.
 *
 * `mark.tsx` is what React renders. `scripts/make-icons.mjs` is what rasterizes
 * the PNGs for the extension toolbar and the favicon, and it cannot import the
 * component: it is a plain Node script with no JSX pipeline. Duplication is the
 * lesser evil, but only if something fails when the two disagree - otherwise
 * you change the logo and the toolbar quietly keeps the old one, which is not a
 * build error in any bundler.
 */
const script = readFileSync(
  new URL("../../../scripts/make-icons.mjs", import.meta.url),
  "utf8",
);

describe("the icon generator", () => {
  it("draws the same segment the component draws", () => {
    expect(script).toContain(DIAL_SEGMENT);
  });

  it("uses the same hub radius", () => {
    expect(script).toContain(`DIAL_HUB = ${DIAL_HUB}`);
    expect(script).toContain(`r="\${DIAL_HUB}"`);
  });

  it("rotates the segment into the same four positions", () => {
    expect(script).toContain(`[${DIAL_ROTATIONS.join(", ")}]`);
  });

  it("puts the fill on a group, not on the root element", () => {
    // Lifting the shapes out of a document that carried `fill` on its <svg>
    // dropped the colour, and the toolbar icon rendered black on black. Not a
    // build error; just an invisible logo.
    expect(script).toMatch(/<g fill="\$\{colour\}"/);
  });
});

describe("the mark's geometry", () => {
  it("keeps the ring inside the viewBox", () => {
    // Outer radius 46 in a 100 box leaves a 4-unit margin. Any larger and the
    // ring is clipped by the square the rasterizer renders into.
    const radii = [...DIAL_SEGMENT.matchAll(/A(\d+) \d+/g)].map((m) => Number(m[1]));
    expect(radii.length).toBeGreaterThan(0);
    for (const r of radii) expect(r).toBeLessThanOrEqual(46);
  });

  it("leaves the hub clear of the ring", () => {
    // The inner edge of the ring is 30. A hub that touched it would close the
    // mark into a solid blob at small sizes.
    expect(DIAL_HUB).toBeLessThan(30 - 8);
  });

  it("has four notches, evenly spaced", () => {
    expect(DIAL_ROTATIONS).toEqual([0, 90, 180, 270]);
  });
});
