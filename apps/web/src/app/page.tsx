import { redirect } from "next/navigation";

import { api } from "~/trpc/server";
import { getSession } from "~/server/better-auth/server";

/**
 * Routes by state. Locked versus unlocked is a client-side distinction - the
 * server cannot know whether the vault key is in memory - so a signed-in user
 * is sent to /vault, which redirects onward to /unlock if it is locked.
 */
export default async function Home() {
  const session = await getSession();
  if (session) redirect("/vault");

  const { registrationOpen } = await api.account.status();
  redirect(registrationOpen ? "/signup" : "/login");
}
