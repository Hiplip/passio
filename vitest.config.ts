import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Next.js loads .env for `next dev`/`next build`; Vitest does not put dotenv
// values on `process.env`. The database-backed server tests import `~/env`,
// which validates DATABASE_URL at module load, so load the file here — before
// any test module is imported.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    // One worker, one file at a time, across the WHOLE run.
    //
    // `fileParallelism` alone only serialises files within a project, and the
    // projects still ran concurrently - so the unit project's Argon2id tests
    // (64 MiB each, several at once) starved the database workers on this
    // 8 GB box. That showed up as a different database test failing on each
    // run, which looked like a data race and was really memory pressure.
    maxWorkers: 1,
    //
    // Five server test files seed and delete rows in ONE shared Neon branch,
    // and account.status answers a question about the whole table - so any
    // overlap makes it read one state and assert against another. Setting this
    // per-project was silently ignored; only the root option is honoured.
    // It costs about a minute a run, which is worth a gate that means something.
    fileParallelism: false,
    testTimeout: 20_000, // Argon2id at 64 MiB is deliberately slow
    projects: [
      {
        // Everything that runs purely in memory: files in parallel, as usual.
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["**/node_modules/**", "src/server/**"],
        },
      },
      {
        // The server tests share one real Neon database, and some of them
        // assert on table-wide state (`account.status` answers "does any user
        // exist?"). Two such files running at once is a race, not a test, so
        // one worker runs them one file at a time. The scope is deliberate:
        // serialising the whole suite instead costs about a minute a run.
        extends: true,
        test: {
          name: "db",
          include: ["src/server/**/*.test.ts", "src/server/**/*.test.tsx"],
        },
      },
    ],
  },
});
