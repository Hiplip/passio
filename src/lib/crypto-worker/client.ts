import type { DeriveRequest, DeriveResponse, DerivationResult } from "./worker";

/**
 * The slice of `Worker` this client uses.
 *
 * Narrow on purpose: a test can supply a fake, since no test environment here
 * can construct a real Worker. Without that seam this file never executes.
 */
export interface DerivationWorker {
  postMessage(request: DeriveRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: { data: DeriveResponse }) => void): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
}

export interface DeriveInWorkerOptions {
  /** Defaults to a real Web Worker. Injected in tests. */
  createWorker?: () => DerivationWorker;
  timeoutMs?: number;
}

/** Argon2id at 64 MiB takes about a second on a laptop and several on a slow
 *  phone. Thirty seconds is far beyond that, and beats hanging forever. */
export const DERIVATION_TIMEOUT_MS = 30_000;

function spawnDerivationWorker(): DerivationWorker {
  return new Worker(new URL("./worker.ts", import.meta.url));
}

/**
 * Runs key derivation in a fresh Web Worker and terminates it afterwards.
 *
 * A worker per call rather than a pool: derivation happens a handful of times
 * per session, so pooling would add state for no benefit, and terminating
 * guarantees nothing lingers in worker memory.
 *
 * Every exit path settles the promise and terminates the worker. A derivation
 * that never answers would otherwise leave the unlock screen spinning with no
 * error to show.
 */
export function deriveInWorker(
  masterPassword: string,
  email: string,
  options: DeriveInWorkerOptions = {},
): Promise<DerivationResult> {
  const { createWorker = spawnDerivationWorker, timeoutMs = DERIVATION_TIMEOUT_MS } = options;

  return new Promise<DerivationResult>((resolve, reject) => {
    const worker = createWorker();
    const id = crypto.randomUUID();

    let settled = false;

    // `timer` is declared below: settle only ever runs from a listener or from
    // the timeout itself, both of which exist after that line has run.
    const settle = (fn: () => void) => {
      if (settled) return; // a terminated worker may still have messages queued
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      fn();
    };

    const timer = setTimeout(
      () => settle(() => reject(new Error("key derivation timed out"))),
      timeoutMs,
    );

    worker.addEventListener("message", (event) => {
      const data = event.data;
      if (data.id !== id) {
        // One worker serves exactly one request, so a foreign id is a bug in
        // this file's plumbing, not a message meant for someone else.
        settle(() => reject(new Error("derivation worker replied to an unknown request")));
        return;
      }

      if (data.ok) {
        settle(() =>
          resolve({ authHash: data.authHash, stretchedKey: data.stretchedKey }),
        );
      } else {
        settle(() => reject(new Error(data.error)));
      }
    });

    worker.addEventListener("error", (event) => {
      settle(() => reject(new Error(event.message ?? "derivation worker failed")));
    });

    const request: DeriveRequest = { id, masterPassword, email };
    worker.postMessage(request);
  });
}
