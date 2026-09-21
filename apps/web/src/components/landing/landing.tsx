import Link from "next/link";

import { Button } from "@passio/ui/button";
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
    body: "Ciphertext. We cannot read it, reset it, or recover it for you. That is the trade: nobody can be persuaded, subpoenaed, or breached into opening your vault, and that includes us.",
  },
] as const;

const FACTS = [
  {
    figure: "18",
    body: "kinds of thing it holds — logins, cards, passports, SSH keys, recovery phrases.",
  },
  {
    figure: "7",
    body: "password managers it imports from, and it names anything it could not carry across.",
  },
  {
    figure: "64 MiB",
    body: "of memory every unlock attempt costs, yours and an attacker's alike.",
  },
  {
    figure: "1",
    body: "outbound request in the whole product, off by default: the breach check, which sends five characters of a hash and never a password.",
  },
] as const;

export function Landing({ registrationOpen }: { registrationOpen: boolean }) {
  const cta = landingCta(registrationOpen);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6 sm:px-8">
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 sm:px-8">
        {/* Hero. Sellable on its own: most people never scroll past it. */}
        <section className="pt-10 pb-20 sm:pt-16 sm:pb-28">
          <h1 className="wordmark max-w-[16ch] text-[2.75rem] leading-[1.03] text-balance sm:text-6xl lg:text-7xl">
            Even we can&rsquo;t open your vault.
          </h1>

          <p className="text-muted-foreground mt-6 max-w-[52ch] text-lg leading-relaxed sm:text-xl">
            Everything is encrypted on your device with a key we never receive. What
            reaches our servers is the noise on the right — all we hold, all we could
            leak, and all anyone could ever demand from us.
          </p>

          <div className="mt-8">
            <Button size="lg" className="h-11 px-5 text-[0.95rem]" render={<Link href={cta.href} />}>
              {cta.label}
            </Button>
            {cta.note ? (
              <p className="text-muted-foreground mt-3 text-sm">{cta.note}</p>
            ) : null}
          </div>

          <div className="mt-14">
            <VaultSplit />
          </div>
        </section>

        {/* The problem, described better than the reader would describe it. */}
        <section className="border-border border-t py-20 sm:py-28">
          <h2 className="wordmark max-w-[18ch] text-3xl leading-[1.1] text-balance sm:text-4xl">
            You already know how this ends.
          </h2>
          <div className="text-muted-foreground mt-6 max-w-[58ch] space-y-4 text-base leading-relaxed sm:text-lg">
            <p>
              A site you signed up for in 2019 gets breached. Your password turns up in a
              list that gets passed around. It is the same password you used for your
              email, because remembering forty different ones was never realistic.
            </p>
            <p className="text-foreground">
              Reusing passwords is not carelessness. It is what happens when a person is
              asked to do a computer&rsquo;s job.
            </p>
          </div>
        </section>

        {/* A real sequence, so it is numbered. */}
        <section className="border-border border-t py-20 sm:py-28">
          <h2 className="wordmark max-w-[18ch] text-3xl leading-[1.1] text-balance sm:text-4xl">
            What happens when you save a password.
          </h2>

          <ol className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.heading}>
                <span className="secret text-muted-foreground text-xs">
                  {index + 1} / {STEPS.length}
                </span>
                <h3 className="mt-2 text-base font-semibold text-balance">
                  {step.heading}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Play before you pay: the shipped generator, not a picture of it. */}
        <section className="border-border border-t py-20 sm:py-28">
          <h2 className="wordmark max-w-[20ch] text-3xl leading-[1.1] text-balance sm:text-4xl">
            Try the generator. It&rsquo;s the real one.
          </h2>
          <p className="text-muted-foreground mt-5 max-w-[56ch] text-base leading-relaxed sm:text-lg">
            The same function the vault and the browser extension call, running here in
            your browser. Nothing you generate is sent anywhere, because there is no
            endpoint to send it to.
          </p>
          <div className="mt-8 max-w-[38rem]">
            <TryGenerator />
          </div>
        </section>

        {/* Numbers, not adjectives. */}
        <section className="border-border border-t py-20 sm:py-28">
          <h2 className="wordmark max-w-[18ch] text-3xl leading-[1.1] text-balance sm:text-4xl">
            What&rsquo;s actually in it.
          </h2>

          <dl className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {FACTS.map((fact) => (
              <div key={fact.figure} className="flex gap-5">
                <dt className="secret text-foreground w-24 shrink-0 text-2xl">
                  {fact.figure}
                </dt>
                <dd className="text-muted-foreground text-sm leading-relaxed">
                  {fact.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      {/* Finish strong: the last thing on the page is the thing worth repeating. */}
      <footer className="border-border border-t">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="wordmark max-w-[20ch] text-3xl leading-[1.1] text-balance sm:text-4xl">
            Built so that trusting us is optional.
          </p>

          <div className="mt-8">
            <Button size="lg" className="h-11 px-5 text-[0.95rem]" render={<Link href={cta.href} />}>
              {cta.label}
            </Button>
          </div>

          <div className="text-muted-foreground mt-14 flex items-center gap-2.5 text-xs">
            <Wordmark size="sm" showName={false} className="opacity-60" />
            <span>passio — a password manager that cannot read your passwords.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
