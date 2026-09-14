import { describe, expect, it } from "vitest";

import { KEEPALIVE_INTERVAL_MS, KEEPALIVE_PORT } from "./keepalive";

/** Chrome evicts an idle MV3 service worker after roughly this long. */
const EVICTION_WINDOW_MS = 30_000;

describe("keepalive", () => {
  it("ticks well inside the eviction window", () => {
    // If the tick were slower than eviction the port would be pointless: the
    // worker, the offscreen document and the vault key would all be collected
    // between ticks, which is the bug this exists to fix.
    expect(KEEPALIVE_INTERVAL_MS).toBeLessThan(EVICTION_WINDOW_MS);
    // And with enough margin that one slow tick does not lose the session.
    expect(KEEPALIVE_INTERVAL_MS).toBeLessThanOrEqual(EVICTION_WINDOW_MS * 0.75);
  });

  it("is not so frequent that it wastes the worker", () => {
    expect(KEEPALIVE_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
  });

  it("names the port distinctly", () => {
    // The worker matches on this name; a generic one would catch traffic that
    // is not ours.
    expect(KEEPALIVE_PORT).toMatch(/^passio-/);
  });
});
