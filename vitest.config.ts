import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.d.ts",
        "src/cli/index.ts",
        "src/lib/index.ts",
        "src/lib/types.ts",
      ],
      thresholds: {
        // branches only at 70% — Slack API error paths in client.ts will be
        // covered incrementally; lines/functions/statements stay at 80%.
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
