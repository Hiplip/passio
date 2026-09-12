// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIPBOARD_CLEAR_MS, copyWithAutoClear } from "./clipboard";

const writeText = vi.fn<(value: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("copyWithAutoClear", () => {
  it("writes the value immediately", async () => {
    await copyWithAutoClear("hunter2");
    expect(writeText).toHaveBeenCalledWith("hunter2");
  });

  it("reports success", async () => {
    await expect(copyWithAutoClear("hunter2")).resolves.toBe(true);
  });

  it("clears the clipboard once the timeout elapses", async () => {
    await copyWithAutoClear("hunter2");
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("does not clear before the timeout", async () => {
    await copyWithAutoClear("hunter2");
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS - 1000);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("does not let an earlier timer wipe a later copy", async () => {
    await copyWithAutoClear("first");
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS / 2);
    await copyWithAutoClear("second");

    // The first copy's timer would fire here if it had not been cancelled.
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS / 2 + 100);
    expect(writeText.mock.calls.map((call) => call[0])).toEqual([
      "first",
      "second",
    ]);

    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("reports failure when the clipboard is unavailable", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    await expect(copyWithAutoClear("hunter2")).resolves.toBe(false);
  });

  it("schedules no clear when the copy itself failed", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    await copyWithAutoClear("hunter2");

    writeText.mockClear();
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS * 2);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("survives the clipboard rejecting the clear", async () => {
    await copyWithAutoClear("hunter2");
    writeText.mockRejectedValueOnce(new Error("denied"));
    await expect(
      vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS),
    ).resolves.not.toThrow();
  });
});
