import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import drizzle from "eslint-plugin-drizzle";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "**/next-env.d.ts",
      "drizzle/**",
      "apps/**/.next/**",
      "apps/extension/.wxt/**",
      "apps/extension/.output/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { drizzle },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // Allows the "omit this key" idiom: const { secret, ...rest } = obj
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // Guard against accidentally unscoped destructive queries.
      "drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: ["db", "ctx.db"] }],
      "drizzle/enforce-update-with-where": ["error", { drizzleObjectName: ["db", "ctx.db"] }],
    },
  },
  // Config and plain-JS files are not part of the typed program.
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-unsafe-assignment": "off" },
  },
);
