// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoLock } from "./use-auto-lock";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const TIMEOUT = 60_000;

describe("useAutoLock", () => {
  it("locks once the idle timeout elapses", () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLock({ timeoutMs: TIMEOUT, isUnlocked: true, onLock }));

    act(() => void vi.advanceTimersByTime(TIMEOUT - 1000));
    expect(onLock).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(2000));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on user activity", () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLock({ timeoutMs: TIMEOUT, isUnlocked: true, onLock }));

    act(() => void vi.advanceTimersByTime(50_000));
    act(() => void window.dispatchEvent(new Event("keydown")));

    // Without the reset this would already have locked.
    act(() => void vi.advanceTimersByTime(50_000));
    expect(onLock).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(11_000));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("locks only once, not repeatedly, while it stays idle", () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLock({ timeoutMs: TIMEOUT, isUnlocked: true, onLock }));

    act(() => void vi.advanceTimersByTime(TIMEOUT * 5));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the vault is already locked", () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLock({ timeoutMs: TIMEOUT, isUnlocked: false, onLock }));

    act(() => void vi.advanceTimersByTime(TIMEOUT * 3));
    expect(onLock).not.toHaveBeenCalled();
  });

  it("never locks when the timeout is disabled", () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLock({ timeoutMs: 0, isUnlocked: true, onLock }));

    act(() => void vi.advanceTimersByTime(60 * 60_000));
    expect(onLock).not.toHaveBeenCalled();
  });

  it("stops listening and stops locking after unmount", () => {
    const onLock = vi.fn();
    const { unmount } = renderHook(() =>
      useAutoLock({ timeoutMs: TIMEOUT, isUnlocked: true, onLock }),
    );

    unmount();
    act(() => void vi.advanceTimersByTime(TIMEOUT * 3));
    expect(onLock).not.toHaveBeenCalled();
  });

  it("uses the latest onLock without restarting the timer", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onLock }: { onLock: () => void }) =>
        useAutoLock({ timeoutMs: TIMEOUT, isUnlocked: true, onLock }),
      { initialProps: { onLock: first } },
    );

    act(() => void vi.advanceTimersByTime(TIMEOUT - 1000));
    rerender({ onLock: second });

    // A restarted timer would need a further full timeout here.
    act(() => void vi.advanceTimersByTime(2000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
