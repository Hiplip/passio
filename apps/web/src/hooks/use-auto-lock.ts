"use client";

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = [
  "keydown",
  "pointerdown",
  "pointermove",
  "scroll",
  "focus",
] as const;

export interface AutoLockOptions {
  /** Idle milliseconds before locking. 0 or less disables auto-lock entirely. */
  timeoutMs: number;
  isUnlocked: boolean;
  onLock: () => void;
}

/**
 * Locks the vault after a period without interaction.
 *
 * `onLock` is held in a ref rather than listed as a dependency: it is usually a
 * fresh closure on every render, and depending on it would restart the idle
 * countdown on each one, so the vault would never actually reach the timeout.
 */
export function useAutoLock({ timeoutMs, isUnlocked, onLock }: AutoLockOptions): void {
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;

  useEffect(() => {
    if (!isUnlocked || timeoutMs <= 0) return;

    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onLockRef.current(), timeoutMs);
    };

    reset();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }

    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [timeoutMs, isUnlocked]);
}
