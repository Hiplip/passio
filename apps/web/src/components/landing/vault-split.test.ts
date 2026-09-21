import { describe, expect, it } from "vitest";

import { frameAt } from "./vault-split";

const CIPHER = "9f2a4c1e8b7d30561a4c7e09d2f8a3c615b4e7091d2c8f3a6b5e4d7c";

describe("frameAt", () => {
  it("is the ciphertext once the scramble finishes", () => {
    expect(frameAt(CIPHER, 1)).toBe(CIPHER);
  });

  it("never changes length, whatever the progress", () => {
    // The panel is three rows of wrapped monospace. A frame one character
    // shorter reflows the whole block, and the scramble reads as a glitch
    // rather than a transition.
    for (let step = 0; step <= 20; step += 1) {
      expect(frameAt(CIPHER, step / 20)).toHaveLength(CIPHER.length);
    }
  });

  it("locks in from the left, so the cursor reads as a direction", () => {
    const frame = frameAt(CIPHER, 0.5);
    const locked = Math.floor(CIPHER.length * 0.5);
    expect(frame.slice(0, locked)).toBe(CIPHER.slice(0, locked));
  });

  it("emits only cipher-face glyphs, which are all the same width", () => {
    for (let step = 0; step <= 20; step += 1) {
      expect(frameAt(CIPHER, step / 20)).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("shows no ciphertext at all before it starts", () => {
    // Progress 0 is the readable password, rendered by the component. If this
    // ever returned real bytes the hold would be skipped and the whole point
    // of the animation - seeing something legible become illegible - is lost.
    expect(frameAt(CIPHER, 0)).not.toBe(CIPHER);
  });
});
