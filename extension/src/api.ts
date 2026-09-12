import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";

// Type-only: pulls the router's SHAPE across, never its code. A value import
// here would drag drizzle, postgres and Better Auth into the extension bundle.
import type { AppRouter } from "@web/server/api/root";

export const API_BASE = "https://passio-hiplip.vercel.app";

export function createApi(token: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_BASE}/api/trpc`,
        transformer: SuperJSON,
        headers: () => ({ authorization: `Bearer ${token}` }),
      }),
    ],
  });
}

export type Api = ReturnType<typeof createApi>;
