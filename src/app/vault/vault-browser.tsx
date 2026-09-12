"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { ItemList } from "~/components/vault/item-list";
import { useVault } from "~/hooks/use-vault";
import { useVaultItems } from "~/hooks/use-vault-items";
import { searchItems } from "~/lib/items/search";

export function VaultBrowser() {
  const { vaultKey } = useVault();
  const { items, damaged, isLoading } = useVaultItems(vaultKey);
  const [query, setQuery] = useState("");

  // The vault is already in memory, so filtering is instant and needs no debounce.
  const visible = searchItems(items, query);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1>Your vault</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? "Decrypting…"
              : `${items.length} ${items.length === 1 ? "item" : "items"}, encrypted on this device`}
          </p>
        </div>

        <Button render={<Link href="/vault/new" />} className="ml-auto">
          <Plus />
          Add item
        </Button>
      </div>

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, username or site"
          aria-label="Search your vault"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-px overflow-hidden rounded-xl border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ItemList items={visible} damaged={damaged} query={query} />
      )}
    </div>
  );
}
