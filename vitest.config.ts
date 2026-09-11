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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    testTimeout: 20_000, // Argon2id at 64 MiB is deliberately slow
  },
});
