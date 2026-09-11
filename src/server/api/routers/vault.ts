import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { user } from "~/server/db/schema";

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
});
