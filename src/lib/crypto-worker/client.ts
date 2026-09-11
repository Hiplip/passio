import type { DeriveRequest, DeriveResponse, DerivationResult } from "./worker";

/**
 * Runs key derivation in a fresh Web Worker and terminates it afterwards.
 *
 * A worker per call rather than a pool: derivation happens a handful of times
 * per session, so pooling would add state for no benefit, and terminating
 * guarantees nothing lingers in worker memory.
 */
export function deriveInWorker(
  masterPassword: string,
  email: string,
): Promise<DerivationResult> {
  return new Promise<DerivationResult>((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url));
    const id = crypto.randomUUID();

    const settle = (fn: () => void) => {
      worker.terminate();
      fn();
    };

    worker.addEventListener("message", (event: MessageEvent<DeriveResponse>) => {
      const data = event.data;
      if (data.id !== id) return;

      if (data.ok) {
        settle(() =>
          resolve({ authHash: data.authHash, stretchedKey: data.stretchedKey }),
        );
      } else {
        settle(() => reject(new Error(data.error)));
      }
    });

    worker.addEventListener("error", (event) => {
      settle(() => reject(new Error(event.message || "derivation worker failed")));
    });

    const request: DeriveRequest = { id, masterPassword, email };
    worker.postMessage(request);
  });
}
