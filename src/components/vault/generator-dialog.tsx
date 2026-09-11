"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  DEFAULT_GENERATOR_OPTIONS,
  generatePassphrase,
  generatePassword,
  type GeneratorOptions,
} from "~/lib/items/generator";

interface GeneratorDialogProps {
  onUse: (password: string) => void;
  onClose: () => void;
}

type Mode = "password" | "passphrase";

export function GeneratorDialog({ onUse, onClose }: GeneratorDialogProps) {
  const [mode, setMode] = useState<Mode>("password");
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_GENERATOR_OPTIONS);
  const [wordCount, setWordCount] = useState(6);
  const [candidate, setCandidate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(() => {
    try {
      setCandidate(
        mode === "password"
          ? generatePassword(options)
          : generatePassphrase(wordCount, "-"),
      );
      setError(null);
    } catch (caught) {
      setCandidate("");
      setError(caught instanceof Error ? caught.message : "Could not generate a password.");
    }
  }, [mode, options, wordCount]);

  useEffect(regenerate, [regenerate]);

  const toggle = (key: keyof GeneratorOptions) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setOptions((current) => ({ ...current, [key]: event.target.checked }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generate a password"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4">Generate a password</h2>

        <div
          className="secret mb-4 min-h-[3.5rem] rounded-[5px] border border-[var(--line)] bg-[var(--paper)] p-3 break-all"
          aria-live="polite"
        >
          {candidate || <span className="text-[var(--danger)]">{error}</span>}
        </div>

        <div className="mb-4 flex gap-2">
          {(["password", "passphrase"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={mode === option ? "primary" : "quiet"}
              className="px-3 py-1.5 text-xs"
              onClick={() => setMode(option)}
            >
              {option === "password" ? "Random" : "Passphrase"}
            </Button>
          ))}
        </div>

        {mode === "password" ? (
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Length</span>
              <span className="flex items-center gap-3">
                <input
                  type="range"
                  min={8}
                  max={64}
                  value={options.length}
                  onChange={(e) =>
                    setOptions((c) => ({ ...c, length: Number(e.target.value) }))
                  }
                />
                <span className="secret w-8 text-right">{options.length}</span>
              </span>
            </label>

            {(
              [
                ["lowercase", "a-z"],
                ["uppercase", "A-Z"],
                ["digits", "0-9"],
                ["symbols", "Symbols"],
                ["excludeAmbiguous", "Avoid look-alikes (I l 1 O 0)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={toggle(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        ) : (
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Words</span>
            <span className="flex items-center gap-3">
              <input
                type="range"
                min={3}
                max={10}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value))}
              />
              <span className="secret w-8 text-right">{wordCount}</span>
            </span>
          </label>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" disabled={!candidate} onClick={() => onUse(candidate)}>
            Use this password
          </Button>
          <Button type="button" variant="quiet" onClick={regenerate}>
            Generate another
          </Button>
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
