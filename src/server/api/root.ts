import { accountRouter } from "~/server/api/routers/account";
import { folderRouter } from "~/server/api/routers/folder";
import { itemRouter } from "~/server/api/routers/item";
import { recoveryRouter } from "~/server/api/routers/recovery";
import { vaultRouter } from "~/server/api/routers/vault";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  account: accountRouter,
  folder: folderRouter,
  item: itemRouter,
  recovery: recoveryRouter,
  vault: vaultRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.vault.getKeys();
 */
export const createCaller = createCallerFactory(appRouter);
