"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@passio/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@passio/ui/dialog";

import { GeneratorPanel } from "./generator-panel";

interface GeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (password: string) => void;
}

/** The generator in a dialog, for the item form. The panel itself is shared
 *  with the extension's Generator tab. */
export function GeneratorDialog({ open, onOpenChange, onUse }: GeneratorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate a password</DialogTitle>
          <DialogDescription>
            Generated on this device. Nothing is sent anywhere.
          </DialogDescription>
        </DialogHeader>

        <GeneratorPanel
          footer={({ candidate, regenerate }) => (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={regenerate}>
                <RefreshCw />
                Regenerate
              </Button>
              <Button
                type="button"
                disabled={!candidate}
                onClick={() => onUse(candidate)}
              >
                Use this password
              </Button>
            </DialogFooter>
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
