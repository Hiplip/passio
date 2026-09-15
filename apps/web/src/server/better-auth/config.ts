import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

import { env } from "~/env";
import { registrationAllowed } from "~/lib/registration";
import { KDF_VERSION } from "@passio/crypto";
import { EXTENSION_ORIGIN } from "~/server/cors";
import { db } from "~/server/db";
import { user as userTable } from "~/server/db/schema";

/**
 * Where this instance answers.
 *
 * Locally that comes from BETTER_AUTH_URL. On Vercel the production domain is
 * not known until the project's first deploy, so fall back to the value Vercel
 * injects rather than requiring a URL that does not exist yet.
 */
function resolveBaseURL(): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  throw new Error(
    "Set BETTER_AUTH_URL: no explicit base URL and not running on Vercel.",
  );
}

/**
 * Better Auth never sees a master password.
 *
 * The client derives an `authHash` from the master password and sends that in
 * the `password` field. Better Auth then hashes it again with its own default
 * (scrypt) before storage, so the database holds a hash of a hash. We do NOT
 * override `emailAndPassword.password.hash`: the default is exactly right, and
 * overriding it would add hand-written crypto for no gain.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: resolveBaseURL(),

  /** The browser extension is a first-party client living on its own origin. */
  trustedOrigins: [EXTENSION_ORIGIN],

  /**
   * Issues a token in the `set-auth-token` response header, which the extension
   * stores and replays as `Authorization: Bearer`.
   *
   * Cookies cannot reach a chrome-extension:// origin without SameSite=None on
   * the web app's session cookie, which would weaken CSRF posture on the site
   * itself purely to serve the extension. A bearer token keeps the two clients
   * independent. It is also not very sensitive here: in a zero-knowledge design
   * a session token buys ciphertext and nothing else.
   */
  plugins: [bearer()],

  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // There is no email provider in this project by design. Recovery is the
    // recovery key, not an email link - in a zero-knowledge design a reset
    // link cannot restore anything anyway.
    requireEmailVerification: false,
  },

  user: {
    additionalFields: {
      // Ciphertext supplied by the client at signup. `required: true` is what
      // makes a user row without vault key material impossible to create.
      protectedVaultKey: { type: "string", required: true, input: true },
      recoveryWrappedVaultKey: { type: "string", required: true, input: true },
      // Arrives as deriveRecoveryAuthHash(recoveryKey) and is replaced with its
      // hash by the create hook below. It is never stored as received.
      recoveryVerifier: { type: "string", required: true, input: true },
      kdfVersion: {
        type: "number",
        required: false,
        defaultValue: KDF_VERSION,
        input: false, // server-controlled, never trusted from the client
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (newUser, ctx) => {
          // The registration gate lives here, not in tRPC, because Better Auth
          // also mounts a public /api/auth/sign-up/email route. A check in
          // application code would only guard the path it sits on.
          //
          // Closed by default. When REGISTRATION_OPEN is not set, the first
          // account is the only account - which is how this deployment has
          // always behaved, and flipping a live instance open is a decision
          // rather than a default.
          const [existing] = await db
            .select({ id: userTable.id })
            .from(userTable)
            .limit(1);

          if (!registrationAllowed(env.REGISTRATION_OPEN, Boolean(existing))) {
            return false; // abort: registration is closed
          }

          const incoming = newUser as typeof newUser & {
            recoveryVerifier: string;
          };

          // Hash the recovery verifier before it reaches storage, using Better
          // Auth's own hasher. A database leak must not yield a usable recovery
          // credential any more than it yields a usable password.
          const hashed = await ctx?.context.password.hash(
            incoming.recoveryVerifier,
          );
          if (!hashed) {
            throw new Error("cannot hash recovery verifier: no auth context");
          }

          return { data: { ...incoming, recoveryVerifier: hashed } };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
