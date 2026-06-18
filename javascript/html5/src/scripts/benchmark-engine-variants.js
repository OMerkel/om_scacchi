import { searchBestMove } from "../js/chess/ai/negamax_search.js";
import { parseFen } from "../js/chess/fen.js";

const CASES = [
	{
		name: "Open game",
		fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		opts: {
			depth: 5,
			maxNodes: 900000,
			iterativeDeepening: true,
			maxTimeMs: 0,
		},
	},
	{
		name: "Tactical capture",
		fen: "k7/8/8/2q1p3/3P4/8/8/7K w - - 0 1",
		opts: {
			depth: 4,
			maxNodes: 400000,
			iterativeDeepening: true,
			maxTimeMs: 0,
		},
	},
];

const VARIANTS = [
	{ label: "Full engine", extra: {} },
	{
		label: "No null/LMR/check-ext",
		extra: { useNullMovePruning: false, useLmr: false, checkExtensions: false },
	},
	{
		label: "No PVS/aspiration",
		extra: { usePvs: false, aspirationWindows: false },
	},
];

for (const benchmarkCase of CASES) {
	const position = parseFen(benchmarkCase.fen);
	console.log(`--- ${benchmarkCase.name} ---`);
	for (const variant of VARIANTS) {
		const result = searchBestMove(position, {
			...benchmarkCase.opts,
			...variant.extra,
		});
		console.log(
			variant.label,
			JSON.stringify({
				move: result.moveUci,
				score: result.score,
				nodes: result.nodes,
				depth: result.searchedDepth,
				pv: result.pv.slice(0, 5),
			}),
		);
	}
}
