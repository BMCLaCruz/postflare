import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // Unit tests (providers mock ctx.fetch) in Node.
      { test: { name: "node", include: ["test/**/*.test.ts"], exclude: ["test/workers/**"], environment: "node" } },
      // The `postflare` CLI (cli/), plain Node.
      { test: { name: "cli", include: ["cli/test/**/*.test.ts"], environment: "node" } },
      // Integration tests: the real app against a local D1/R2 inside workerd.
      "./vitest.workers.config.ts",
    ],
  },
});
