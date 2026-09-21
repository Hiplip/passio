import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { Landing } from "~/components/landing/landing";
import { api } from "~/trpc/server";
import { getSession } from "~/server/better-auth/server";

/**
 * The landing page, and the router for anyone who already has a vault.
 *
 * A signed-in request never sees this: it goes straight to /vault, which
 * redirects onward to /unlock if the vault is locked. Locked versus unlocked
 * is a client-side distinction - the server cannot know whether the vault key
 * is in memory - so /vault is as far as the server can route.
 */

const DESCRIPTION =
  "Everything is encrypted on your device with a key passio never receives. " +
  "What reaches the server is ciphertext — all we hold, and all anyone could demand from us.";

export const metadata: Metadata = {
  title: "passio — even we can't open your vault",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "passio",
    title: "Even we can't open your vault.",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Even we can't open your vault.",
    description: DESCRIPTION,
  },
};

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/vault");

  const { registrationOpen } = await api.account.status();
  return <Landing registrationOpen={registrationOpen} />;
}
