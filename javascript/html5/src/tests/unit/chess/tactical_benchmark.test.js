import { describe, expect, it } from "vitest";
import { searchBestMove } from "../../../js/chess/ai/negamax_search.js";
import { parseFen } from "../../../js/chess/fen.js";

const CASES = [
	{
		name: "prefer queen capture over pawn capture",
		fen: "k7/8/8/2q1p3/3P4/8/8/7K w - - 0 1",
		expectedMove: "d4c5",
		depth: 1,
	},
	{
		name: "prefer immediate high-value capture in tactical frontier",
		fen: "4k3/8/8/2q1p3/3P4/8/8/4K3 w - - 0 1",
		expectedMove: "d4c5",
		depth: 1,
	},
];

describe("chess tactical benchmark suite", () => {
	for (const testCase of CASES) {
		it(testCase.name, () => {
			const position = parseFen(testCase.fen);
			const result = searchBestMove(position, {
				depth: testCase.depth,
				maxNodes: 50000,
			});

			expect(result.moveUci).toBe(testCase.expectedMove);
			expect(result.nodes).toBeGreaterThan(0);
			expect(result.pv.length).toBeGreaterThan(0);
		});
	}
});
