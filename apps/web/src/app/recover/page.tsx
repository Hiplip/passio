import { AuthShell } from "~/components/layout/auth-shell";

import { RecoverForm } from "./recover-form";

export default function RecoverPage() {
  return (
    <AuthShell>
      <RecoverForm />
    </AuthShell>
  );
}
