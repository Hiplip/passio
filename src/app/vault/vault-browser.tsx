"use client";

import Link from "next/link";
import { useState } from "react";

import { ItemList } from "~/components/vault/item-list";
import { useVault } from "~/hooks/use-vault";
import { useVaultItems } from "~/hooks/use-vault-items";
import { searchItems } from "~/lib/items/search";

export function VaultBrowser() {
  const { vaultKey } = useVault();
  const { items, damaged, isLoading } = useVaultItems(vaultKey);
  const [query, setQuery] = useState("");

  // The vault is already in memory, so filtering is instant and needs no
  // debounce.
  const visible = searchItems(items, query);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto">Your vault</h1>
        <Link
          href="/vault/new"
          className="rounded-[5px] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-ink)] hover:opacity-90"
        >
          Add item
        </Link>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, username or site"
        aria-label="Search your vault"
        className="w-full max-w-md rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-base"
      />

      {isLoading ? (
        <p className="py-10 text-[var(--muted)]">Decrypting your vault…</p>
      ) : (
        <ItemList items={visible} damaged={damaged} query={query} />
      )}
    </div>
  );
}
