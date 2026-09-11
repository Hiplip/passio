import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import { normalizeEmail } from "~/lib/crypto";
import { toBase64Url, utf8ToBytes } from "~/lib/crypto/encoding";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { auth } from "~/server/better-auth";
import { account, session, user } from "~/server/db/schema";

/** The server cannot read a ciphertext, but it can insist on the envelope. */
const ciphertext = z
  .string()
  .regex(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "malformed ciphertext");

/**
 * Normalised before it is validated, and normalised in the schema rather than
 * in a handler so that no procedure can forget to do it. Signup stored the
 * address in this form, so a lookup has to compare against this form too, and
 * `  A@B.test ` pasted out of a password manager has to find the account.
 */
const emailInput = z.string().transform(normalizeEmail).pipe(z.string().email());

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/** One message for both "no such account" and "wrong recovery key". The two
 *  must be indistinguishable, so the string lives in one place. */
const RECOVERY_FAILED = "recovery failed";

const unauthorized = () =>
  new TRPCError({ code: "UNAUTHORIZED", message: RECOVERY_FAILED });

/**
 * A scrypt hash of a fixed string, computed once per process.
 *
 * An absent account has no verifier to check, so without this the unknown-email
 * path would return in microseconds while a wrong key spent scrypt's worth of
 * work. The error message would match and the clock would still give the answer
 * away. Verifying against this instead costs the same as the real thing.
 */
let absentAccountVerifier: Promise<string> | undefined;
function verifierForAbsentAccount(
  hash: (password: string) => Promise<string>,
): Promise<string> {
  absentAccountVerifier ??= hash("passio-absent-account-placeholder");
  return absentAccountVerifier;
}

/**
 * A stand-in `recoveryWrappedVaultKey` for an email with no account.
 *
 * `getWrappedKey` is public and unauthenticated by necessity — someone who has
 * lost their master password has no session — so an error for an unknown email
 * would turn it into a user-enumeration oracle: ask it about an address, learn
 * whether that address has an account here.
 *
 * The decoy is derived from an HMAC of the normalised email under the server
 * secret, which buys two properties a random string does not have. It is
 * deterministic, so asking twice gives the same answer — a value that changed
 * between calls would itself be the tell. And it is unpredictable without the
 * secret, so a caller cannot recompute it offline and recognise a decoy by it.
 * The byte lengths match what `wrapVaultKey` emits: a 12-byte IV and a 48-byte
 * body (32 key bytes plus the 16-byte GCM tag).
 */
async function decoyWrappedVaultKey(normalizedEmail: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8ToBytes(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Two 32-byte blocks, counter-separated, give the 60 bytes the envelope needs.
  const blocks = await Promise.all(
    [0, 1].map(async (counter) =>
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          utf8ToBytes(`passio-recovery-decoy-v1:${counter}:${normalizedEmail}`),
        ),
      ),
    ),
  );

  const stream = new Uint8Array(64);
  stream.set(blocks[0]!, 0);
  stream.set(blocks[1]!, 32);

  return `v1.${toBase64Url(stream.subarray(0, 12))}.${toBase64Url(stream.subarray(12, 60))}`;
}

export const recoveryRouter = createTRPCRouter({
  /**
   * Hands back the recovery-key wrapping of the vault key so the client can
   * unwrap it locally. Public because the whole point of recovery is that the
   * caller cannot sign in.
   *
   * Handing this to anyone who asks is safe: it is ciphertext, and the key that
   * opens it is the recovery key, which the server has never held.
   */
  getWrappedKey: publicProcedure
    .input(z.object({ email: emailInput }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ recoveryWrappedVaultKey: user.recoveryWrappedVaultKey })
        .from(user)
        .where(eq(user.email, input.email))
        .limit(1);

      return {
        recoveryWrappedVaultKey:
          row?.recoveryWrappedVaultKey ??
          (await decoyWrappedVaultKey(input.email)),
      };
    }),

  /**
   * Redeems a recovery key: proves possession via the stored verifier, then
   * rotates the master password, both wrapped copies of the vault key, and the
   * recovery key itself.
   *
   * The vault key inside those wrappings is unchanged — the client unwrapped it
   * with the old recovery key and re-wrapped the same 32 bytes — which is why
   * no item has to be re-encrypted and why items saved before a recovery are
   * still readable after it.
   */
  recover: publicProcedure
    .input(
      z.object({
        email: emailInput,
        recoveryAuthHash: z.string().min(1),
        newAuthHash: z.string().min(8).max(128),
        newProtectedVaultKey: ciphertext,
        newRecoveryWrappedVaultKey: ciphertext,
        newRecoveryVerifier: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const context = await auth.$context;

      const [existing] = await ctx.db
        .select()
        .from(user)
        .where(eq(user.email, input.email))
        .limit(1);

      if (!existing) {
        // Same message, same work, same shape as a wrong key: no enumeration.
        await context.password.verify({
          hash: await verifierForAbsentAccount(context.password.hash),
          password: input.recoveryAuthHash,
        });
        throw unauthorized();
      }

      if (
        existing.recoveryLockedUntil &&
        existing.recoveryLockedUntil.getTime() > Date.now()
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "too many recovery attempts, try again later",
        });
      }

      const valid = await context.password.verify({
        hash: existing.recoveryVerifier,
        password: input.recoveryAuthHash,
      });

      if (!valid) {
        // The recovery verifier is the one credential reachable without a
        // session, so guessing it has to get expensive quickly.
        const attempts = existing.recoveryFailedAttempts + 1;
        await ctx.db
          .update(user)
          .set({
            recoveryFailedAttempts: attempts,
            recoveryLockedUntil:
              attempts >= MAX_ATTEMPTS
                ? new Date(Date.now() + LOCKOUT_MS)
                : null,
          })
          .where(eq(user.id, existing.id));

        throw unauthorized();
      }

      const [hashedAuth, hashedVerifier] = await Promise.all([
        context.password.hash(input.newAuthHash),
        context.password.hash(input.newRecoveryVerifier),
      ]);

      await ctx.db
        .update(user)
        .set({
          protectedVaultKey: input.newProtectedVaultKey,
          recoveryWrappedVaultKey: input.newRecoveryWrappedVaultKey,
          recoveryVerifier: hashedVerifier,
          recoveryKeyCreatedAt: new Date(),
          recoveryFailedAttempts: 0,
          recoveryLockedUntil: null,
        })
        .where(eq(user.id, existing.id));

      // Better Auth keeps the password on the credential account row, so the
      // provider has to be in the WHERE clause: a social account row for the
      // same user must not have a password written into it.
      await ctx.db
        .update(account)
        .set({ password: hashedAuth })
        .where(
          and(
            eq(account.userId, existing.id),
            eq(account.providerId, "credential"),
          ),
        );

      // Anyone holding a live session predates this recovery, and the person
      // recovering has no way to know who that is. Evict them all.
      await ctx.db.delete(session).where(eq(session.userId, existing.id));

      return { ok: true as const };
    }),
});
