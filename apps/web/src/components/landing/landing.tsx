import Link from "next/link";

import { Button } from "@passio/ui/button";
import { Mark } from "@passio/ui/mark";
import { Wordmark } from "@passio/ui/wordmark";
import { landingCta } from "~/lib/landing-cta";

import { TryGenerator } from "./try-generator";
import { VaultSplit } from "./vault-split";

/**
 * The only page a stranger sees.
 *
 * Built on the product's own tokens rather than a separate marketing palette,
 * so the page and the thing it sells are visibly one object: porcelain ground,
 * ink type, and iris spent on exactly one thing - a real secret. The primary
 * button is ink like every button in the vault, because branding the call to
 * action in a security colour is what makes every password manager's site look
 * like every other one.
 *
 * The page is built in two grounds, not one. A long page of identically spaced
 * sections on a single ground reads as a document however well it is set, so
 * the argument that carries the most feeling - and the close - sit on ink,
 * and the explaining sits on porcelain between them. The dark bands are where
 * the eye lands when it skims.
 */

const STEPS = [
  {
    heading: "You type your master password",
    body: "It never leaves the device. Argon2id turns it into a key right here, spending 64 MiB of memory per attempt — which is what makes guessing it expensive for anyone who tries.",
  },
  {
    heading: "Your vault is locked before it leaves",
    body: "Every item is sealed with AES-GCM and bound to its own identity, so nothing can be swapped between items or quietly rolled back to an older version without the seal breaking.",
  },
  {
    heading: "We store what's left",
    body: "Ciphertext. We cannot read it, reset it, or recover it for you. That is the trade: nobody can be persuaded, subpoenaed or breached into opening your vault, and that includes us.",
  },
] as const;

const FACTS = [
  {
    figure: "18",
    label: "kinds of thing",
    body: "Logins, cards, passports, SSH keys, recovery phrases — each with its own fields rather than a notes box.",
  },
  {
    figure: "7",
    label: "managers it imports",
    body: "Bitwarden, LastPass, 1Password, KeePass, Chrome, Firefox and its own export. It names anything it could not carry.",
  },
  {
    figure: "64",
    label: "MiB per unlock",
    body: "What one attempt at your master password costs in memory — yours once, an attacker's every single time.",
  },
  {
    figure: "1",
    label: "outbound request",
    body: "The breach check, off by default. It sends five characters of a hash, never a password, and never your vault.",
  },
] as const;

function Cta({ cta, note }: { cta: ReturnType<typeof landingCta>; note: boolean }) {
  return (
    <div>
      <Button
        size="lg"
        className="h-12 rounded-xl px-6 text-[0.95rem]"
        render={<Link href={cta.href} />}
      >
        {cta.label}
      </Button>
      {note && cta.note ? (
        <p className="text-muted-foreground mt-3.5 text-sm">{cta.note}</p>
      ) : null}
    </div>
  );
}

export function Landing({ registrationOpen }: { registrationOpen: boolean }) {
  const cta = landingCta(registrationOpen);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Wordmark size="md" />
        {registrationOpen ? (
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Sign in
          </Link>
        ) : null}
      </header>

      <main className="flex-1">
        {/* Hero. Most people never scroll past it, so it sells on its own. */}
        <section className="mx-auto w-full max-w-6xl px-5 pt-12 pb-20 sm:px-8 sm:pt-20 sm:pb-28">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
            <div>
              <h1 className="wordmark max-w-[14ch] text-[2.9rem] leading-[1.02] text-balance sm:text-6xl lg:text-[4.5rem]">
                Even we can&rsquo;t open your vault.
              </h1>

              <p className="text-muted-foreground mt-7 max-w-[46ch] text-lg leading-relaxed sm:text-xl">
                Everything is encrypted on your device with a key we never receive. What
                reaches our servers is the noise beside this — all we hold, all we could
                leak, and all anyone could ever demand from us.
              </p>

              <div className="mt-9">
                <Cta cta={cta} note />
              </div>
            </div>

            <VaultSplit />
          </div>
        </section>

        {/* Ink. The emotional landmark, and where a skimming eye lands. */}
        <section className="bg-pitch text-pitch-foreground">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <p className="secret text-pitch-foreground/45 text-xs">The part nobody enjoys</p>

            <h2 className="wordmark mt-6 max-w-[17ch] text-[2.1rem] leading-[1.06] text-balance sm:text-5xl lg:text-6xl">
              You already know how this ends.
            </h2>

            <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-16">
              <p className="text-pitch-foreground/70 max-w-[52ch] text-base leading-relaxed sm:text-lg">
                A site you signed up for in 2019 gets breached. Your password turns up in
                a list that gets passed around. It is the same password you used for your
                email, because remembering forty different ones was never realistic. Then
                it is your email — and your email is the key to everything else.
              </p>
              <p className="max-w-[26ch] text-xl leading-[1.3] font-medium text-balance sm:text-2xl lg:text-[1.75rem]">
                Reusing passwords is not carelessness. It is what happens when a person is
                asked to do a computer&rsquo;s job.
              </p>
            </div>
          </div>
        </section>

        {/* A real sequence, so it is numbered. */}
        <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <h2 className="wordmark max-w-[17ch] text-[2.1rem] leading-[1.06] text-balance sm:text-5xl">
            What happens when you save a password.
          </h2>

          <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.heading} className="border-foreground/85 border-t pt-5">
                <span className="secret text-cipher text-sm">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-lg leading-snug font-semibold text-balance">
                  {step.heading}
                </h3>
                <p className="text-muted-foreground mt-2.5 text-sm leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Play before you pay: the shipped generator, not a picture of one. */}
        <section className="border-border border-t">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
            <div>
              <h2 className="wordmark max-w-[16ch] text-[2.1rem] leading-[1.06] text-balance sm:text-5xl">
                Try the generator. It&rsquo;s the real one.
              </h2>
              <p className="text-muted-foreground mt-6 max-w-[46ch] text-base leading-relaxed sm:text-lg">
                The same function the vault and the browser extension call, running here in
                your browser. Nothing you generate is sent anywhere, because there is no
                endpoint to send it to.
              </p>
            </div>
            <TryGenerator />
          </div>
        </section>

        {/* Numbers, not adjectives. Set in the cipher face, at size. */}
        <section className="border-border border-t">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
            <h2 className="wordmark max-w-[16ch] text-[2.1rem] leading-[1.06] text-balance sm:text-5xl">
              What&rsquo;s actually in it.
            </h2>

            <dl className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {FACTS.map((fact) => (
                <div key={fact.label} className="border-foreground/85 border-t pt-5">
                  <dt>
                    <span className="secret block text-[2.75rem] leading-none sm:text-5xl">
                      {fact.figure}
                    </span>
                    <span className="text-muted-foreground mt-2.5 block text-xs font-medium">
                      {fact.label}
                    </span>
                  </dt>
                  <dd className="text-muted-foreground mt-3.5 text-sm leading-relaxed">
                    {fact.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      {/* Ink again to close: the last thing on the page is the line worth repeating. */}
      <footer className="bg-pitch text-pitch-foreground relative overflow-hidden">
        {/* The dial, finally at a size that shows it is a dial. Quiet enough to
            read as ground rather than as a second logo. */}
        <Mark
          aria-hidden
          className="text-pitch-foreground/[0.055] pointer-events-none absolute -right-16 -bottom-24 size-[26rem] sm:-right-10 sm:size-[32rem]"
        />

        <div className="relative mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <p className="wordmark max-w-[18ch] text-[2.1rem] leading-[1.06] text-balance sm:text-5xl lg:text-6xl">
            Built so that trusting us is optional.
          </p>

          <div className="mt-10">
            <Button
              size="lg"
              className="bg-pitch-foreground text-pitch h-12 rounded-xl px-6 text-[0.95rem] hover:bg-[color-mix(in_oklch,var(--pitch-foreground),var(--pitch)_12%)]"
              render={<Link href={cta.href} />}
            >
              {cta.label}
            </Button>
          </div>

          <div className="border-pitch-foreground/15 mt-20 flex items-center gap-2.5 border-t pt-8">
            <Wordmark size="sm" showName={false} className="opacity-45" />
            <span className="text-pitch-foreground/55 text-xs">
              passio — a password manager that cannot read your passwords.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
