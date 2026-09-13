import "@testing-library/jest-dom/vitest";

import { webcrypto } from "node:crypto";
import { afterEach } from "vitest";

/**
 * jsdom ships a `crypto` object without `subtle`, so component tests that touch
 * real keys would fail for reasons unrelated to the code under test. Node's
 * WebCrypto is the same implementation the node-environment tests already use.
 *
 * This only fills a gap; it never replaces a working implementation.
 */
if (typeof globalThis.crypto?.subtle === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

/**
 * Testing Library only registers its own cleanup when vitest runs in globals
 * mode, which this project deliberately does not. Without this, renders pile up
 * across tests in a file and queries start matching several elements.
 *
 * Guarded on `window` so node-environment tests never import React DOM.
 */
if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
