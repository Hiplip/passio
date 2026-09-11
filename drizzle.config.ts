import { type Config } from "drizzle-kit";

import { env } from "~/env";

export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  // No tablesFilter: the T3 scaffold's "passio_*" prefix pattern was dropped
  // along with pgTableCreator, so filtering would hide the Better Auth tables
  // from introspection and make drizzle try to re-create them.
} satisfies Config;
