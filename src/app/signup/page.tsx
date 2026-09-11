import { AuthShell } from "~/components/layout/auth-shell";

import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
