// Vitest configuration
// Tests pure ES-module functions under Node – no browser environment needed.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/unit/**/*.test.js"],
		environment: "node",
		coverage: {
			provider: "v8",
			include: ["js/uct/**/*.js", "js/chess/**/*.js"],
			exclude: ["js/chess/chess_renderer.js"],
			reporter: ["text", "html"],
			thresholds: {
				statements: 98,
				branches: 97,
				functions: 98,
				lines: 98,
			},
		},
	},
});
