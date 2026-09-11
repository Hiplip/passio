"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { GeneratorDialog } from "~/components/vault/generator-dialog";
import { SecretField } from "~/components/vault/secret-field";
import { TotpDisplay } from "~/components/vault/totp-display";
import { digitsOnly, formatCardNumber, maskCardNumber } from "~/lib/items/mask";
import { type CardItem, type Item, type LoginItem, type NoteItem } from "~/lib/items/schema";
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
      className="flex max-w-xl flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Field
        label="Name"
        value={value.title}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        required
      />

      {value.type === "login" ? (
        <LoginFields value={value} onChange={onChange} />
      ) : value.type === "note" ? (
        <NoteFields value={value} onChange={onChange} />
      ) : (
        <CardFields value={value} onChange={onChange} />
      )}

      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving || value.title.trim().length === 0}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        {onDelete ? (
          <Button
            type="button"
            variant="danger"
            className="ml-auto"
            onClick={onDelete}
          >
            Delete
          </Button>
        ) : null}
      </div>
    </form>
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

      <div className="flex flex-col gap-2">
        <SecretField
          label="Password"
          value={value.password ?? ""}
          onChange={(password) => onChange({ ...value, password })}
        />
        <button
          type="button"
          className="self-start text-sm text-[var(--accent)] underline"
          onClick={() => setGenerating(true)}
        >
          Generate a password
        </button>
      </div>

      <Field
        label="Website"
        value={value.uri ?? ""}
        onChange={(e) => onChange({ ...value, uri: e.target.value })}
        placeholder="https://"
        autoComplete="off"
      />

      <div className="flex flex-col gap-2">
        <Field
          label="Authenticator (TOTP)"
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

      <Field
        label="Notes"
        value={value.notes ?? ""}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
      />

      {generating ? (
        <GeneratorDialog
          onClose={() => setGenerating(false)}
          onUse={(password) => {
            onChange({ ...value, password });
            setGenerating(false);
          }}
        />
      ) : null}
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor="note-body" className="text-sm font-medium">
        Note
      </label>
      <textarea
        id="note-body"
        rows={10}
        value={value.body ?? ""}
        onChange={(e) => onChange({ ...value, body: e.target.value })}
        className="w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-base"
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

      <div className="flex gap-3">
        <Field
          label="Expiry month"
          type="number"
          min={1}
          max={12}
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

      <Field
        label="Notes"
        value={value.notes ?? ""}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
      />
    </>
  );
}
