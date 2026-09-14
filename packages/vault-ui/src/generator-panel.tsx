"use client";

import { useCallback, useEffect, useState } from "react";

import { Label } from "@passio/ui/label";
import { Slider } from "@passio/ui/slider";
import { Switch } from "@passio/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@passio/ui/tabs";
import {
  DEFAULT_GENERATOR_OPTIONS,
  generatePassphrase,
  generatePassword,
  type GeneratorOptions,
} from "@passio/core/generator";

type Mode = "password" | "passphrase";

/**
 * The shadcn Slider wrapper is not generic over its value, so Base UI hands the
 * change handler an untyped value. Narrowing here keeps `any` out of the app
 * without asserting a type we have not actually checked.
 */
function firstNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (Array.isArray(value) && typeof value[0] === "number") return value[0];
  return fallback;
}

const TOGGLES = [
  ["lowercase", "Lowercase (a-z)"],
  ["uppercase", "Uppercase (A-Z)"],
  ["digits", "Digits (0-9)"],
  ["symbols", "Symbols"],
  ["excludeAmbiguous", "Avoid look-alikes (I l 1 O 0)"],
] as const;

export interface GeneratorApi {
  candidate: string;
  regenerate: () => void;
}

/**
 * The generator, with no opinion about what surrounds it.
 *
 * Extracted from the dialog so the extension's Generator tab is the same code
 * rather than a second implementation. The actions differ - the web app offers
 * "Use this password", the popup offers "Copy" - so they come in as a render
 * prop instead of being baked in.
 */
export function GeneratorPanel({
  footer,
}: {
  footer: (api: GeneratorApi) => React.ReactNode;
}) {
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
      setError(
        caught instanceof Error ? caught.message : "Could not generate a password.",
      );
    }
  }, [mode, options, wordCount]);

  useEffect(regenerate, [regenerate]);

  return (
    <div className="grid gap-4">
      <div
        aria-live="polite"
        className="bg-cipher-soft text-cipher secret grid min-h-16 place-items-center rounded-xl px-4 py-3.5 text-center text-[15px] leading-relaxed break-all"
      >
        {candidate || <span className="text-destructive text-sm">{error}</span>}
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="w-full">
          <TabsTrigger value="password" className="flex-1">
            Random
          </TabsTrigger>
          <TabsTrigger value="passphrase" className="flex-1">
            Passphrase
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "password" ? (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Length</Label>
              <span className="secret text-muted-foreground text-sm">
                {options.length}
              </span>
            </div>
            <Slider
              min={8}
              max={64}
              value={[options.length]}
              onValueChange={(v: unknown) =>
                setOptions((c) => ({ ...c, length: firstNumber(v, c.length) }))
              }
            />
          </div>

          <div className="grid gap-3">
            {TOGGLES.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`gen-${key}`} className="font-normal">
                  {label}
                </Label>
                <Switch
                  id={`gen-${key}`}
                  checked={options[key]}
                  onCheckedChange={(checked) =>
                    setOptions((c) => ({ ...c, [key]: checked }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Words</Label>
            <span className="secret text-muted-foreground text-sm">{wordCount}</span>
          </div>
          <Slider
            min={3}
            max={10}
            value={[wordCount]}
            onValueChange={(v: unknown) =>
              setWordCount((current) => firstNumber(v, current))
            }
          />
        </div>
      )}

      {footer({ candidate, regenerate })}
    </div>
  );
}
