"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@passio/ui/button";
import { Input } from "@passio/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@passio/ui/select";
import { Switch } from "@passio/ui/switch";
import { SecretField } from "./secret-field";
import type { CustomField, Item } from "@passio/core/schema";

const KIND_LABELS: Record<CustomField["kind"], string> = {
  text: "Text",
  hidden: "Hidden",
  boolean: "Yes / no",
};

/**
 * Fields the user invents.
 *
 * Available on every item type, because no fixed set of fields survives contact
 * with reality - security questions, account numbers, the name of the branch
 * you opened the account at. Without somewhere to put them, importing from
 * another manager silently drops data, which is the worst failure this product
 * has.
 *
 * `hidden` masks like a password. `boolean` stores "true"/"false" as a string
 * so the encrypted blob stays a flat, forward-compatible shape.
 */
export function CustomFields({
  value,
  onChange,
}: {
  value: Item;
  onChange: (next: Item) => void;
}) {
  const fields = value.fields ?? [];

  const write = (next: CustomField[]) =>
    onChange({ ...value, fields: next.length > 0 ? next : undefined });

  const update = (index: number, patch: Partial<CustomField>) =>
    write(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <div className="grid gap-4">
      {fields.map((field, index) => (
        <div key={index} className="grid gap-2">
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Name of field ${index + 1}`}
              value={field.name}
              placeholder="Field name"
              className="h-8 flex-1"
              onChange={(e) => update(index, { name: e.target.value })}
            />

            <Select
              items={KIND_LABELS}
              value={field.kind}
              onValueChange={(next: string | null) =>
                update(index, { kind: (next as CustomField["kind"] | null) ?? "text" })
              }
            >
              <SelectTrigger
                aria-label={`Type of field ${index + 1}`}
                className="h-8 w-28 shrink-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABELS).map(([kind, label]) => (
                  <SelectItem key={kind} value={kind}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-full"
              aria-label={`Remove ${field.name || `field ${index + 1}`}`}
              onClick={() => write(fields.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          </div>

          {field.kind === "hidden" ? (
            <SecretField
              label={field.name || "Value"}
              value={field.value}
              onChange={(next) => update(index, { value: next })}
            />
          ) : field.kind === "boolean" ? (
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={field.value === "true"}
                onCheckedChange={(checked) =>
                  update(index, { value: checked ? "true" : "false" })
                }
              />
              <span className="text-muted-foreground">
                {field.value === "true" ? "Yes" : "No"}
              </span>
            </label>
          ) : (
            <Input
              aria-label={field.name || `Value of field ${index + 1}`}
              value={field.value}
              placeholder="Value"
              onChange={(e) => update(index, { value: e.target.value })}
            />
          )}
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => write([...fields, { name: "", value: "", kind: "text" }])}
      >
        <Plus />
        Add field
      </Button>
    </div>
  );
}
