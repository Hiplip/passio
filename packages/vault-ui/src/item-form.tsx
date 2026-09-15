"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@passio/ui/alert";
import { Button } from "@passio/ui/button";
import { Field } from "@passio/ui/field";
import { Label } from "@passio/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@passio/ui/select";
import { Textarea } from "@passio/ui/textarea";
import { GeneratorDialog } from "./generator-dialog";
import { SecretField } from "./secret-field";
import { CustomFields } from "./custom-fields";
import { GenericFields } from "./generic-fields";
import { TYPE_SPECS } from "@passio/core/fields";
import { TotpDisplay } from "./totp-display";
import { useVaultData } from "./data";
import { digitsOnly, formatCardNumber, maskCardNumber } from "@passio/core/mask";
import type { CardItem, Item, LoginItem, NoteItem } from "@passio/core/schema";
import { parseTotpInput } from "@passio/core/totp";

interface ItemFormProps {
  value: Item;
  onChange: (next: Item) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  error: string | null;
}

/** A labelled break between groups of fields, so the form reads in chunks. */
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-muted-foreground text-[12.5px] font-medium">{label}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

export function ItemForm({
  value,
  onChange,
  onSave,
  onCancel,
  onDelete,
  saving,
  error,
}: ItemFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      {/* No card. The form is the whole screen, so a panel around it would
          only draw a box around the page. */}
      <div className="grid gap-5">
        <div className="grid gap-5">
          {/* Short fields share a row on wider screens: one tall column of
              full-width inputs reads as a form dump. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Name"
              value={value.title}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
              required
            />
            <FolderPicker value={value} onChange={onChange} />
          </div>

          {/* Login, note and card keep hand-written editors because they do
              real work - parsing otpauth links, masking a card as you type,
              opening the generator. Everything else is labelled fields, and
              GenericFields renders those from the shared table. */}
          {value.type === "login" ? (
            <LoginFields value={value} onChange={onChange} />
          ) : value.type === "note" ? (
            <NoteFields value={value} onChange={onChange} />
          ) : value.type === "card" ? (
            <CardFields value={value} onChange={onChange} />
          ) : (
            <>
              <Divider label={TYPE_SPECS[value.type].label} />
              <GenericFields value={value} onChange={onChange} />

              <Divider label="Notes" />
              <Textarea
                aria-label="Notes"
                rows={3}
                value={value.notes ?? ""}
                onChange={(e) => onChange({ ...value, notes: e.target.value })}
                placeholder="Anything else worth keeping with this item"
              />
            </>
          )}

          <Divider label="Custom fields" />
          <CustomFields value={value} onChange={onChange} />

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-5">
          <Button
            type="submit"
            size="lg"
            disabled={saving || value.title.trim().length === 0}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          {onDelete ? (
            // Quiet by default: a heavy red button on a screen you open just to
            // read a password is an easy mis-click.
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="text-destructive hover:bg-destructive/10 ml-auto"
              onClick={onDelete}
            >
              <Trash2 />
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/** The sentinel for "no folder". A Select cannot carry undefined as a value. */
const NO_FOLDER = "__none__";

function FolderPicker({
  value,
  onChange,
}: {
  value: Item;
  onChange: (next: Item) => void;
}) {
  const { folders } = useVaultData();

  // Base UI renders the raw value unless the root is told how to label it,
  // which is why this field used to show a bare folder uuid.
  const labels: Record<string, string> = { [NO_FOLDER]: "No folder" };
  for (const folder of folders) labels[folder.id] = folder.name;

  return (
    <div className="grid gap-2">
      {/* Same fixed-height label row as Field, so the two align side by side. */}
      <div className="flex min-h-6 items-center">
        <Label htmlFor="item-folder">Folder</Label>
      </div>
      <Select
        items={labels}
        value={value.folderId ?? NO_FOLDER}
        onValueChange={(next: string | null) =>
          onChange({
            ...value,
            // Base UI can clear a Select to null; both that and the sentinel
            // mean the same thing here.
            folderId: next === null || next === NO_FOLDER ? undefined : next,
          })
        }
      >
        <SelectTrigger id="item-folder" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_FOLDER}>No folder</SelectItem>
          {folders.map((folder) => (
            <SelectItem key={folder.id} value={folder.id}>
              {folder.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LoginFields({
  value,
  onChange,
}: {
  value: LoginItem;
  onChange: (next: Item) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [totpInput, setTotpInput] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);

  function applyTotp(raw: string) {
    setTotpInput(raw);
    if (raw.trim().length === 0) {
      setTotpError(null);
      onChange({ ...value, totp: undefined });
      return;
    }

    const parsed = parseTotpInput(raw);
    if (!parsed) {
      setTotpError("That is not a valid authenticator secret or otpauth link.");
      return;
    }
    setTotpError(null);
    onChange({ ...value, totp: parsed });
  }

  return (
    <>
      <Divider label="Sign in" />

      <Field
        label="Username"
        value={value.username ?? ""}
        onChange={(e) => onChange({ ...value, username: e.target.value })}
        autoComplete="off"
      />

      <SecretField
        label="Password"
        value={value.password ?? ""}
        onChange={(password) => onChange({ ...value, password })}
        action={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setGenerating(true)}
          >
            <Sparkles />
            Generate
          </Button>
        }
      />

      <Field
        label="Website"
        value={value.uri ?? ""}
        onChange={(e) => onChange({ ...value, uri: e.target.value })}
        placeholder="example.com"
        autoComplete="off"
      />

      <Divider label="One-time codes" />

      <Field
        label="Authenticator"
        value={totpInput}
        onChange={(e) => applyTotp(e.target.value)}
        placeholder="Paste an otpauth:// link or the secret"
        error={totpError ?? undefined}
        hint={value.totp ? undefined : "Generated on this device, never on the server."}
        autoComplete="off"
      />
      {value.totp ? <TotpDisplay config={value.totp} /> : null}

      <Divider label="Notes" />

      <Textarea
        aria-label="Notes"
        rows={3}
        value={value.notes ?? ""}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
        placeholder="Anything else worth keeping with this login"
      />

      <GeneratorDialog
        open={generating}
        onOpenChange={setGenerating}
        onUse={(password) => {
          onChange({ ...value, password });
          setGenerating(false);
        }}
      />
    </>
  );
}

function NoteFields({
  value,
  onChange,
}: {
  value: NoteItem;
  onChange: (next: Item) => void;
}) {
  return (
    <>
      <Divider label="Note" />
      <Textarea
        aria-label="Note"
        rows={14}
        value={value.body ?? ""}
        onChange={(e) => onChange({ ...value, body: e.target.value })}
        placeholder="Encrypted on this device before it is saved"
      />
    </>
  );
}

function CardFields({
  value,
  onChange,
}: {
  value: CardItem;
  onChange: (next: Item) => void;
}) {
  return (
    <>
      <Divider label="Card" />

      <Field
        label="Name on card"
        value={value.cardholderName ?? ""}
        onChange={(e) => onChange({ ...value, cardholderName: e.target.value })}
        autoComplete="off"
      />

      <SecretField
        label="Card number"
        value={value.number ?? ""}
        // Formatting is for display only: digits alone reach the ciphertext.
        onChange={(raw) => onChange({ ...value, number: digitsOnly(raw) })}
        maskedDisplay={maskCardNumber(value.number ?? "")}
        placeholder={formatCardNumber("4111111111111111")}
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label="Expiry month"
          type="number"
          min={1}
          max={12}
          placeholder="12"
          value={value.expMonth ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              expMonth: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
        <Field
          label="Expiry year"
          type="number"
          min={2000}
          max={2100}
          placeholder="2030"
          value={value.expYear ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              expYear: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
        <SecretField
          label="Security code"
          value={value.cvv ?? ""}
          onChange={(cvv) => onChange({ ...value, cvv })}
        />
      </div>

      <Divider label="Notes" />

      <Textarea
        aria-label="Notes"
        rows={3}
        value={value.notes ?? ""}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
      />
    </>
  );
}
