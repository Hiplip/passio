import { afterEach, describe, expect, it, vi } from "vitest";

import type { WrappingKey } from "..";

import { DERIVATION_TIMEOUT_MS, deriveInWorker, type DerivationWorker } from "./client";
import type { DeriveRequest, DeriveResponse } from "./worker";

/**
 * Stands in for the real Worker, which the test environment cannot construct.
 * Without it this file's message plumbing would never execute at all.
 */
class FakeWorker {
  readonly sent: DeriveRequest[] = [];
  terminations = 0;
  private readonly onMessage: ((event: { data: DeriveResponse }) => void)[] = [];
  private readonly onError: ((event: { message?: string }) => void)[] = [];

  postMessage(request: DeriveRequest): void {
    this.sent.push(request);
  }

  terminate(): void {
    this.terminations += 1;
  }

  addEventListener(type: "message", listener: (event: { data: DeriveResponse }) => void): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
  addEventListener(
    type: "message" | "error",
    listener: ((event: { data: DeriveResponse }) => void) &
      ((event: { message?: string }) => void),
  ): void {
    if (type === "message") this.onMessage.push(listener);
    else this.onError.push(listener);
  }

  emit(data: DeriveResponse): void {
    for (const listener of this.onMessage) listener({ data });
  }

  emitError(message: string): void {
    for (const listener of this.onError) listener({ message });
  }

  get lastRequest(): DeriveRequest {
    const request = this.sent.at(-1);
    if (!request) throw new Error("the client posted nothing to the worker");
    return request;
  }
}

async function aKey(): Promise<WrappingKey> {
  return (await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ])) as WrappingKey;
}

/** Starts a derivation against a fake worker and hands back both. */
function start(timeoutMs?: number) {
  const worker = new FakeWorker();
  const createWorker = (): DerivationWorker => worker;
  const result = deriveInWorker("master pw", "owner@example.com", { createWorker, timeoutMs });
  // Swallow the unhandled rejection warning for the tests that assert rejection.
  result.catch(() => undefined);
  return { worker, result };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("deriveInWorker", () => {
  it("posts the password and email with a request id", () => {
    const { worker } = start();

    expect(worker.lastRequest.masterPassword).toBe("master pw");
    expect(worker.lastRequest.email).toBe("owner@example.com");
    expect(worker.lastRequest.id).not.toBe("");
  });

  it("resolves with the derivation and terminates the worker", async () => {
    const { worker, result } = start();
    const stretchedKey = await aKey();

    worker.emit({ id: worker.lastRequest.id, ok: true, authHash: "hash", stretchedKey });

    await expect(result).resolves.toEqual({ authHash: "hash", stretchedKey });
    expect(worker.terminations).toBe(1);
  });

  it("rejects with the worker's own message when derivation fails", async () => {
    const { worker, result } = start();

    worker.emit({ id: worker.lastRequest.id, ok: false, error: "email is required" });

    await expect(result).rejects.toThrow("email is required");
    expect(worker.terminations).toBe(1);
  });

  it("rejects when the worker itself errors", async () => {
    const { worker, result } = start();

    worker.emitError("worker blew up");

    await expect(result).rejects.toThrow("worker blew up");
    expect(worker.terminations).toBe(1);
  });

  it("rejects rather than hanging when a reply carries an unknown id", async () => {
    const { worker, result } = start();
    const stretchedKey = await aKey();

    worker.emit({ id: "some-other-request", ok: true, authHash: "hash", stretchedKey });

    await expect(result).rejects.toThrow(/unknown request/i);
    expect(worker.terminations).toBe(1);
  });

  it("ignores anything the worker says after it has settled", async () => {
    const { worker, result } = start();
    const stretchedKey = await aKey();
    const id = worker.lastRequest.id;

    worker.emit({ id, ok: true, authHash: "hash", stretchedKey });
    worker.emit({ id, ok: false, error: "too late" });

    await expect(result).resolves.toEqual({ authHash: "hash", stretchedKey });
    expect(worker.terminations).toBe(1);
  });

  it("gives up after the timeout instead of hanging the unlock screen", async () => {
    vi.useFakeTimers();
    const { worker, result } = start();

    await vi.advanceTimersByTimeAsync(DERIVATION_TIMEOUT_MS);

    await expect(result).rejects.toThrow(/timed out/i);
    expect(worker.terminations).toBe(1);
  });

  it("does not time out a derivation that answers in time", async () => {
    vi.useFakeTimers();
    const { worker, result } = start();
    const stretchedKey = await aKey();

    await vi.advanceTimersByTimeAsync(DERIVATION_TIMEOUT_MS - 1);
    worker.emit({ id: worker.lastRequest.id, ok: true, authHash: "hash", stretchedKey });
    await vi.advanceTimersByTimeAsync(DERIVATION_TIMEOUT_MS);

    await expect(result).resolves.toBeDefined();
  });

  it("waits 30 seconds by default, long enough for Argon2 on a slow phone", () => {
    expect(DERIVATION_TIMEOUT_MS).toBe(30_000);
  });
});
