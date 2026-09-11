import type { WrappingKey } from "~/lib/crypto/types";

import { type DerivationResult, performDerivation } from "./derive";

export interface DeriveRequest {
  id: string;
  masterPassword: string;
  email: string;
}

export type DeriveResponse =
  | { id: string; ok: true; authHash: string; stretchedKey: WrappingKey }
  | { id: string; ok: false; error: string };

export type { DerivationResult };

/**
 * Runs Argon2id off the main thread.
 *
 * `CryptoKey` is structured-cloneable, so the derived key crosses the worker
 * boundary without ever being exported to raw bytes.
 *
 * This file is deliberately thin: it holds no state and contains no logic worth
 * testing. Everything real lives in `performDerivation`, which is unit-tested.
 */
addEventListener("message", (event: MessageEvent<DeriveRequest>) => {
  const { id, masterPassword, email } = event.data;

  void performDerivation(masterPassword, email)
    .then(({ authHash, stretchedKey }) => {
      const response: DeriveResponse = { id, ok: true, authHash, stretchedKey };
      postMessage(response);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "derivation failed";
      const response: DeriveResponse = { id, ok: false, error: message };
      postMessage(response);
    });
});
