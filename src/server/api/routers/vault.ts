import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { auth } from "~/server/better-auth";
import { account, user } from "~/server/db/schema";

/** The server cannot read a ciphertext, but it can insist on the envelope. */
const ciphertext = z
  .string()
  .regex(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "malformed ciphertext");

export const vaultRouter = createTRPCRouter({
  /**
   * The key material the client needs to unlock the vault: the vault key
   * wrapped by the master key, and the KDF version it was wrapped under.
   *
   * Deliberately absent: `recoveryWrappedVaultKey` and `recoveryVerifier`.
   * Those belong only to the recovery flow, and an unlock response is no place
   * to hand them out. Ownership is enforced in the WHERE clause, so another
   * user's row is indistinguishable from a row that does not exist.
   */
  getKeys: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        protectedVaultKey: user.protectedVaultKey,
        kdfVersion: user.kdfVersion,
      })
      .from(user)
      .where(eq(user.id, ctx.session.user.id))
      .limit(1);

    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "no vault key for this account",
      });
    }

    return row;
  }),

  /**
   * Changes the master password.
   *
   * Only the wrapping changes: the vault key inside it is the same key, so no
   * item is re-encrypted and the recovery key keeps working. The client does
   * the unwrap and re-wrap; the server never sees either key.
   *
   * The current auth hash is required even though the session is already valid.
   * Without it a stolen session cookie would be enough to lock the real owner
   * out of their own vault.
   */
  rewrap: protectedProcedure
    .input(
      z.object({
        currentAuthHash: z.string().min(8).max(128),
        newAuthHash: z.string().min(8).max(128),
        newProtectedVaultKey: ciphertext,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const context = await auth.$context;

      const [credential] = await ctx.db
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, ctx.session.user.id),
            eq(account.providerId, "credential"),
          ),
        )
        .limit(1);

      const valid =
        credential?.password != null &&
        (await context.password.verify({
          hash: credential.password,
          password: input.currentAuthHash,
        }));

      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "incorrect master password",
        });
      }

      await ctx.db
        .update(user)
        .set({ protectedVaultKey: input.newProtectedVaultKey })
        .where(eq(user.id, ctx.session.user.id));

      await ctx.db
        .update(account)
        .set({ password: await context.password.hash(input.newAuthHash) })
        .where(eq(account.id, credential.id));

      return { ok: true as const };
    }),
});
