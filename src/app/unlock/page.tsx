import { redirect } from "next/navigation";

import { AuthShell } from "~/components/layout/auth-shell";
import { getSession } from "~/server/better-auth/server";

import { UnlockForm } from "./unlock-form";

export default async function UnlockPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AuthShell>
      <UnlockForm email={session.user.email} />
    </AuthShell>
  );
}
