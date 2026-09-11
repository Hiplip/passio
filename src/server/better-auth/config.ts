import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "~/env";
import { KDF_VERSION } from "~/lib/crypto";
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
          // The single-account gate lives here, not in tRPC, because Better
          // Auth also mounts a public /api/auth/sign-up/email route. A check in
          // application code would only guard the path it sits on.
          const [existing] = await db
            .select({ id: userTable.id })
            .from(userTable)
            .limit(1);
          if (existing) return false; // abort: registration is closed

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
