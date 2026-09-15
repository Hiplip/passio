import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { user } from "~/server/db/schema";
import { env } from "~/env";

export const accountRouter = createTRPCRouter({
  /**
   * Drives whether the signup page renders a form or a closed notice. This is
   * presentation only: the authoritative single-account gate is the Better Auth
   * database hook in `src/server/better-auth/config.ts`, which also covers the
   * public /api/auth/sign-up/email route this query does not sit on.
   */
  status: publicProcedure.query(async ({ ctx }) => {
    if (env.REGISTRATION_OPEN) return { registrationOpen: true };

    const [existing] = await ctx.db
      .select({ id: user.id })
      .from(user)
      .limit(1);

    return { registrationOpen: !existing };
  }),
});
