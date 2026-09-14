"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@passio/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@passio/ui/dialog";
import { Field } from "@passio/ui/field";
import { useVaultData } from "./data";

interface FolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when renaming; absent when creating. */
  existing?: { id: string; name: string };
}

export function FolderDialog({ open, onOpenChange, existing }: FolderDialogProps) {
  const { createFolder, renameFolder } = useVaultData();

  const [name, setName] = useState(existing?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening the dialog for a different folder must not show the old name.
  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setError(null);
    }
  }, [open, existing?.name]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length === 0 || busy) return;

    setBusy(true);
    setError(null);

    try {
      // The id is generated before the name is encrypted, because the id is
      // the folder's additional authenticated data.
      const id = existing?.id ?? crypto.randomUUID();

      if (existing) {
        await renameFolder(id, name.trim());
      } else {
        await createFolder(id, name.trim());
      }

      toast.success(existing ? "Folder renamed" : "Folder created");
      onOpenChange(false);
    } catch {
      setError("Could not save the folder. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{existing ? "Rename folder" : "New folder"}</DialogTitle>
            <DialogDescription>
              Folder names are encrypted too, so the server never sees them.
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error ?? undefined}
            placeholder="Work"
            autoFocus
            required
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length === 0}>
              {busy ? "Saving…" : existing ? "Rename" : "Create folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
