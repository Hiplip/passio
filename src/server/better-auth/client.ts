import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "./config";

/**
 * `inferAdditionalFields` carries the vault key fields declared on the server
 * through to the client's types, so `signUp.email` accepts protectedVaultKey,
 * recoveryWrappedVaultKey and recoveryVerifier without casting.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export type Session = typeof authClient.$Infer.Session;
