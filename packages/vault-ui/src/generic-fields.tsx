"use client";

import { Field } from "@passio/ui/field";
import { Textarea } from "@passio/ui/textarea";
import { SecretField } from "./secret-field";
import { fieldValue, TYPE_SPECS, withField } from "@passio/core/fields";
import type { Item } from "@passio/core/schema";

/**
 * The editor for every item type that has no special behaviour.
 *
 * Login, note and card keep hand-written editors because they genuinely do
 * things: parsing an otpauth link, masking a card number as you type, opening
 * the generator. The other fifteen types are just labelled fields, and writing
 * those by hand would be a hundred inputs that drift apart one at a time.
 *
 * Driven by `TYPE_SPECS`, which `fields.test.ts` checks against the schema -
 * so a key that does not exist on the item cannot silently render an input that
 * writes somewhere nothing reads.
 */
export function GenericFields({
  value,
  onChange,
}: {
  value: Item;
  onChange: (next: Item) => void;
}) {
  const spec = TYPE_SPECS[value.type];

  // Narrow fields pair up on a wide screen; anything full-width breaks the run.
  const rows: Array<typeof spec.fields> = [];
  for (const field of spec.fields) {
    const last = rows[rows.length - 1];
    if (field.narrow && last?.length === 1 && last[0]?.narrow) last.push(field);
    else rows.push([field]);
  }

  return (
    <>
      {rows.map((row, i) => (
        <div
          key={row.map((f) => f.key).join("|") || i}
          className={row.length > 1 ? "grid gap-5 sm:grid-cols-2" : undefined}
        >
          {row.map((field) => {
            const current = fieldValue(value, field.key) ?? "";

            if (field.kind === "multiline") {
              return (
                <div key={field.key} className="grid gap-2">
                  <div className="flex min-h-6 items-center">
                    <span className="text-sm font-medium">{field.label}</span>
                  </div>
                  <Textarea
                    aria-label={field.label}
                    rows={4}
                    value={current}
                    placeholder={field.placeholder}
                    onChange={(e) => onChange(withField(value, field.key, e.target.value))}
                  />
                </div>
              );
            }

            if (field.kind === "secret") {
              return (
                <SecretField
                  key={field.key}
                  label={field.label}
                  value={current}
                  onChange={(next) => onChange(withField(value, field.key, next))}
                  placeholder={field.placeholder}
                />
              );
            }

            return (
              <Field
                key={field.key}
                label={field.label}
                value={current}
                placeholder={field.placeholder}
                autoComplete="off"
                onChange={(e) => onChange(withField(value, field.key, e.target.value))}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}
