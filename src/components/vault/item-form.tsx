"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { useFolders } from "~/hooks/use-folders";
import { useVault } from "~/hooks/use-vault";
import { GeneratorDialog } from "~/components/vault/generator-dialog";
import { SecretField } from "~/components/vault/secret-field";
import { TotpDisplay } from "~/components/vault/totp-display";
import { digitsOnly, formatCardNumber, maskCardNumber } from "~/lib/items/mask";
import type { CardItem, Item, LoginItem, NoteItem } from "~/lib/items/schema";
import { parseTotpInput } from "~/lib/items/totp";

interface ItemFormProps {
  value: Item;
  onChange: (next: Item) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  error: string | null;
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
      <Card>
        <CardContent className="grid gap-5">
          <Field
            label="Name"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            required
          />

          <FolderPicker value={value} onChange={onChange} />

          {value.type === "login" ? (
            <LoginFields value={value} onChange={onChange} />
          ) : value.type === "note" ? (
            <NoteFields value={value} onChange={onChange} />
          ) : (
            <CardFields value={value} onChange={onChange} />
          )}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>

        <CardFooter className="gap-2 border-t">
          <Button type="submit" disabled={saving || value.title.trim().length === 0}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {onDelete ? (
            <Button
              type="button"
              variant="destructive"
              className="ml-auto"
              onClick={onDelete}
            >
              <Trash2 />
              Delete
            </Button>
          ) : null}
        </CardFooter>
      </Card>
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
  const { vaultKey } = useVault();
  const { folders } = useFolders(vaultKey);

  return (
    <div className="grid gap-2">
      <Label htmlFor="item-folder">Folder</Label>
      <Select
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
      <Field
        label="Username"
        value={value.username ?? ""}
        onChange={(e) => onChange({ ...value, username: e.target.value })}
        autoComplete="off"
      />

      <div className="grid gap-2">
        <SecretField
          label="Password"
          value={value.password ?? ""}
          onChange={(password) => onChange({ ...value, password })}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() => setGenerating(true)}
        >
          <Sparkles />
          Generate
        </Button>
      </div>

      <Field
        label="Website"
        value={value.uri ?? ""}
        onChange={(e) => onChange({ ...value, uri: e.target.value })}
        placeholder="https://"
        autoComplete="off"
      />

      <div className="grid gap-2">
        <Field
          label="Authenticator (one-time codes)"
          value={totpInput}
          onChange={(e) => applyTotp(e.target.value)}
          placeholder="Paste an otpauth:// link or the secret"
          error={totpError ?? undefined}
          hint={
            value.totp
              ? undefined
              : "Optional. Codes are generated on this device, never on the server."
          }
          autoComplete="off"
        />
        {value.totp ? <TotpDisplay config={value.totp} /> : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="login-notes">Notes</Label>
        <Textarea
          id="login-notes"
          rows={3}
          value={value.notes ?? ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>

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
    <div className="grid gap-2">
      <Label htmlFor="note-body">Note</Label>
      <Textarea
        id="note-body"
        rows={12}
        value={value.body ?? ""}
        onChange={(e) => onChange({ ...value, body: e.target.value })}
      />
    </div>
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

      <div className="grid grid-cols-2 gap-4">
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
      </div>

      <SecretField
        label="Security code"
        value={value.cvv ?? ""}
        onChange={(cvv) => onChange({ ...value, cvv })}
      />

      <div className="grid gap-2">
        <Label htmlFor="card-notes">Notes</Label>
        <Textarea
          id="card-notes"
          rows={3}
          value={value.notes ?? ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>
    </>
  );
}
