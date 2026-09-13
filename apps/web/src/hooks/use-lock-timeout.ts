"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "passio.lockTimeoutMinutes";

/** 0 means never auto-lock. */
export const LOCK_TIMEOUT_CHOICES = [1, 5, 15, 30, 0] as const;
export const DEFAULT_LOCK_TIMEOUT_MINUTES = 15;

export function describeLockTimeout(minutes: number): string {
  if (minutes === 0) return "Never";
  return minutes === 1 ? "After 1 minute" : `After ${minutes} minutes`;
}

/**
 * The auto-lock preference, kept in localStorage.
 *
 * This is the one thing in the app that legitimately belongs there: it is a
 * non-secret convenience, and losing it costs nothing. No key, ciphertext or
 * vault data is ever stored client-side.
 */
export function useLockTimeout(): [number, (minutes: number) => void] {
  const [minutes, setMinutes] = useState(DEFAULT_LOCK_TIMEOUT_MINUTES);

  // Read after mount: localStorage does not exist during server rendering, and
  // reading it in useState would produce a hydration mismatch.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed >= 0) setMinutes(parsed);
  }, []);

  const update = useCallback((next: number) => {
    setMinutes(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  return [minutes, update];
}
