import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		exclude: ["tests/e2e/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			reportsDirectory: "coverage",
			include: ["src/**/*.ts"],
			exclude: ["src/browser/**", "src/lib/types.ts", "src/client/client.ts"],
		},
	},
});
