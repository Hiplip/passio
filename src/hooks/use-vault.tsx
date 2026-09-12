"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { VaultKey } from "@passio/crypto";

interface VaultContextValue {
  vaultKey: VaultKey | null;
  isUnlocked: boolean;
  unlock: (key: VaultKey) => void;
  lock: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/**
 * Holds the unwrapped vault key for the lifetime of the tab.
 *
 * The key is NEVER written to localStorage, sessionStorage, IndexedDB or a
 * cookie. A reload re-locks the vault. That is the feature, not a gap: the only
 * copy of the key lives in memory, so closing the tab genuinely ends access.
 */
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [vaultKey, setVaultKey] = useState<VaultKey | null>(null);

  const unlock = useCallback((key: VaultKey) => setVaultKey(key), []);
  const lock = useCallback(() => setVaultKey(null), []);

  const value = useMemo<VaultContextValue>(
    () => ({ vaultKey, isUnlocked: vaultKey !== null, unlock, lock }),
    [vaultKey, unlock, lock],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used inside a VaultProvider");
  }
  return context;
}
