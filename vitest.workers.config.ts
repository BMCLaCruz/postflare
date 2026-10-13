import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { buildDefines } from "./build-info";

// Integration tests: the real Hono app against a real (local, in-memory) D1 and R2, inside workerd.
export default defineWorkersConfig({
  define: buildDefines(),
  test: {
    name: "workers",
    include: ["test/workers/**/*.test.ts"],
    poolOptions: {
      workers: {
        singleWorker: true,
        // One shared instance per run: test files build their own users/workspaces (unique emails).
        isolatedStorage: false,
        wrangler: { configPath: "./test/workers/wrangler.test.jsonc" },
      },
    },
  },
});
