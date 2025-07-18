import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["**/*.test.ts", "**/*.spec.ts"],
		exclude: ["node_modules", "dist"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/",
				"dist/",
				"**/*.d.ts",
				"**/*.config.*",
				"**/coverage/**",
			],
		},
		testTimeout: 30000, // DynamoDB operations can be slow
		hookTimeout: 30000,
	},
	resolve: {
		alias: {
			"@": "/src",
		},
	},
});
