"use client";

import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@passio/ui/alert";
import { Button } from "@passio/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@passio/ui/select";
import { Textarea } from "@passio/ui/textarea";
import { SettingsGroup, SettingsRow } from "@passio/vault-ui/settings-list";
import { useVaultData } from "@passio/vault-ui/data";
import {
  FORMAT_LABELS,
  IMPORT_FORMATS,
  parseImport,
  type ImportFormat,
} from "@passio/core/import";
import { csvLosses, toCsv, toPlainJson } from "@passio/core/export";

/**
 * Getting a vault in and out.
 *
 * Import is the single biggest barrier to anyone adopting a password manager -
 * nobody retypes two hundred credentials - and export is what makes arriving
 * reasonable in the first place. Both are here rather than buried, and both say
 * plainly what they did.
 */
export function DataForm() {
  return (
    <div className="grid gap-8">
      <ImportPanel />
      <ExportPanel />
    </div>
  );
}

function ImportPanel() {
  const { createItem, createFolder } = useVaultData();

  const [format, setFormat] = useState<ImportFormat>("bitwarden");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [done, setDone] = useState<number | null>(null);

  async function run() {
    setBusy(true);
    setWarnings([]);
    setDone(null);

    const result = parseImport(format, text, () => crypto.randomUUID());
    setWarnings(result.warnings);

    if (result.items.length === 0) {
      setBusy(false);
      if (result.warnings.length === 0) toast.error("Nothing to import.");
      return;
    }

    try {
      // Folders first: items reference them by the id assigned above.
      for (const folder of result.folders) await createFolder(folder.id, folder.name);
      for (const item of result.items) await createItem(crypto.randomUUID(), item);

      setDone(result.items.length);
      setText("");
      toast.success(`Imported ${result.items.length} items`);
    } catch {
      // Partial imports are possible and saying so matters: re-running would
      // otherwise duplicate whatever already landed.
      setWarnings((current) => [
        ...current,
        "The import stopped partway. Some items may already have been added — check your vault before trying again.",
      ]);
      toast.error("Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file: File) {
    setText(await file.text());
  }

  return (
    <SettingsGroup
      title="Import"
      description="Everything is encrypted on this device before it is saved. The file never leaves your browser."
    >
      <SettingsRow label="From" hint="Export without encryption from the other manager first">
        <Select
          items={FORMAT_LABELS}
          value={format}
          onValueChange={(next: string | null) =>
            setFormat((next as ImportFormat | null) ?? "bitwarden")
          }
        >
          <SelectTrigger aria-label="Import format" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMPORT_FORMATS.map((value) => (
              <SelectItem key={value} value={value}>
                {FORMAT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>

      <SettingsRow label="File" hint="Or paste the contents below">
        <Button variant="outline" size="sm" render={<label htmlFor="import-file" />}>
          <Upload />
          Choose file
          <input
            id="import-file"
            type="file"
            accept=".csv,.json,.txt"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
        </Button>
      </SettingsRow>

      <div className="grid gap-3 py-3">
        <Textarea
          aria-label="Paste your export"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the contents of your export here"
          className="secret text-[12px]"
        />

        {warnings.length > 0 ? (
          <Alert>
            <AlertTitle>
              {done !== null ? `Imported ${done} items, with notes` : "Nothing was imported"}
            </AlertTitle>
            <AlertDescription>
              <ul className="grid list-disc gap-1 pl-4">
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <Button
          size="lg"
          className="justify-self-start"
          disabled={busy || text.trim().length === 0}
          onClick={() => void run()}
        >
          {busy ? "Importing…" : "Import"}
        </Button>
      </div>
    </SettingsGroup>
  );
}

function ExportPanel() {
  const { live, folders } = useVaultData();
  const [confirming, setConfirming] = useState<"json" | "csv" | null>(null);

  const input = {
    folders: folders.map((f) => ({ id: f.id, name: f.name })),
    items: live.items.map((entry) => ({ id: entry.id, item: entry.data })),
  };

  const losses = csvLosses(input);

  function download(name: string, contents: string, mime: string) {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    setConfirming(null);
  }

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <SettingsGroup
      title="Export"
      description="Your vault, in the clear. Anyone who opens the file can read every password in it — keep it somewhere you would keep the passwords themselves, and delete it when you are done."
    >
      <SettingsRow label="JSON" hint="Everything, losing nothing">
        <Button variant="outline" size="sm" onClick={() => setConfirming("json")}>
          <Download />
          Export
        </Button>
      </SettingsRow>

      <SettingsRow label="CSV" hint="For moving to another password manager">
        <Button variant="outline" size="sm" onClick={() => setConfirming("csv")}>
          <Download />
          Export
        </Button>
      </SettingsRow>

      {confirming ? (
        <div className="py-3">
          <Alert variant="destructive">
            <AlertTitle>This file is not encrypted</AlertTitle>
            <AlertDescription>
              <p>
                Every password, card number and recovery phrase in your vault will be
                readable by anyone who opens it.
              </p>

              {confirming === "csv" && losses.length > 0 ? (
                <>
                  <p className="mt-3">CSV also cannot carry everything:</p>
                  <ul className="mt-1 grid list-disc gap-1 pl-4">
                    {losses.map((loss, i) => (
                      <li key={i}>{loss}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    confirming === "json"
                      ? download(
                          `passio-${stamp}.json`,
                          toPlainJson(input, new Date()),
                          "application/json",
                        )
                      : download(`passio-${stamp}.csv`, toCsv(input), "text/csv")
                  }
                >
                  I understand — download it
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
    </SettingsGroup>
  );
}
