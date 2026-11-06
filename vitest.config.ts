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
			// Vitest 4+ remaps v8 coverage via the AST, so every inline callback
			// (e.g. Playwright `.catch(() => false)` fallbacks) and every `||`/`??`/
			// ternary arm now counts. Functions/branches are calibrated to that
			// stricter measurement rather than the old v8-to-istanbul numbers.
			thresholds: {
				lines: 90,
				statements: 90,
				functions: 78,
				branches: 75,
			},
		},
	},
});
