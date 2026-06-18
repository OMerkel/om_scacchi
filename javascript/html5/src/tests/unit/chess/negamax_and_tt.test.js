import { describe, expect, it, vi } from "vitest";
import { searchBestMove } from "../../../js/chess/ai/negamax_search.js";
import { parseFen } from "../../../js/chess/fen.js";
import { createTranspositionTable } from "../../../js/chess/transposition_table.js";

describe("chess/transposition table", () => {
	it("validates table size input", () => {
		expect(() => createTranspositionTable(0)).toThrow(/positive integer/);
	});

	it("stores and retrieves entries by position key and side", () => {
		const tt = createTranspositionTable(4);
		tt.set("fenA", "w", {
			depth: 3,
			score: 21,
			flag: "EXACT",
			bestMoveUci: "e2e4",
		});

		const entry = tt.get("fenA", "w");
		expect(entry).toBeTruthy();
		expect(entry.depth).toBe(3);
		expect(entry.bestMoveUci).toBe("e2e4");
	});

	it("normalizes missing bestMoveUci to null", () => {
		const tt = createTranspositionTable(4);
		tt.set("fenA", "w", { depth: 1, score: 0, flag: "EXACT" });

		const entry = tt.get("fenA", "w");
		expect(entry.bestMoveUci).toBeNull();
	});

	it("keeps side-to-move entries separate", () => {
		const tt = createTranspositionTable(4);
		tt.set("fenA", "w", {
			depth: 2,
			score: 10,
			flag: "EXACT",
			bestMoveUci: "e2e4",
		});
		tt.set("fenA", "b", {
			depth: 2,
			score: -10,
			flag: "EXACT",
			bestMoveUci: "e7e5",
		});

		expect(tt.get("fenA", "w")?.bestMoveUci).toBe("e2e4");
		expect(tt.get("fenA", "b")?.bestMoveUci).toBe("e7e5");
	});

	it("keeps deeper entry when a shallower replacement is attempted", () => {
		const tt = createTranspositionTable(4);
		tt.set("fenA", "w", {
			depth: 4,
			score: 50,
			flag: "EXACT",
			bestMoveUci: "d2d4",
		});
		tt.set("fenA", "w", {
			depth: 2,
			score: 10,
			flag: "UPPER",
			bestMoveUci: "e2e4",
		});

		const entry = tt.get("fenA", "w");
		expect(entry.depth).toBe(4);
		expect(entry.bestMoveUci).toBe("d2d4");
	});

	it("evicts oldest entries when over capacity", () => {
		const tt = createTranspositionTable(2);
		tt.set("fenA", "w", {
			depth: 1,
			score: 1,
			flag: "EXACT",
			bestMoveUci: "a2a3",
		});
		tt.set("fenB", "w", {
			depth: 1,
			score: 2,
			flag: "EXACT",
			bestMoveUci: "b2b3",
		});
		tt.set("fenC", "w", {
			depth: 1,
			score: 3,
			flag: "EXACT",
			bestMoveUci: "c2c3",
		});

		expect(tt.size()).toBe(2);
		expect(tt.get("fenA", "w")).toBeNull();
		expect(tt.get("fenB", "w")).toBeTruthy();
		expect(tt.get("fenC", "w")).toBeTruthy();
	});

	it("clears all entries", () => {
		const tt = createTranspositionTable(2);
		tt.set("fenA", "w", {
			depth: 1,
			score: 1,
			flag: "EXACT",
			bestMoveUci: "a2a3",
		});
		tt.clear();

		expect(tt.size()).toBe(0);
		expect(tt.get("fenA", "w")).toBeNull();
	});
});

describe("chess/ai search with quiescence ordering", () => {
	it("falls back to default depth and node budget for non-integer inputs", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, {
			depth: "invalid",
			maxNodes: "invalid",
		});

		expect(result.moveUci).toBeTruthy();
		expect(result.nodes).toBeGreaterThan(0);
		expect(result.searchedDepth).toBeGreaterThan(0);
	});

	it("returns TT exact cached move immediately when provided at root", () => {
		const position = parseFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		const tt = {
			get: () => ({ depth: 99, score: 7, flag: "EXACT", bestMoveUci: "e2e4" }),
			set: () => ({}),
		};

		const result = searchBestMove(position, { depth: 2, maxNodes: 1000, tt });
		expect(result.moveUci).toBe("e2e4");
		expect(result.score).toBe(7);
	});

	it("handles TT EXACT entry without best move PV safely", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const tt = {
			get: () => ({ depth: 99, score: 11, flag: "EXACT", bestMoveUci: null }),
			set: () => ({}),
		};

		const result = searchBestMove(position, { depth: 2, maxNodes: 1000, tt });
		expect(result.move).toBeNull();
		expect(result.moveUci).toBeNull();
		expect(result.score).toBe(11);
	});

	it("triggers TT LOWER alpha-beta cutoff branch", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const tt = {
			get: () => ({
				depth: 99,
				score: Number.MAX_SAFE_INTEGER,
				flag: "LOWER",
				bestMoveUci: null,
			}),
			set: () => ({}),
		};

		const result = searchBestMove(position, { depth: 2, maxNodes: 1000, tt });
		expect(result.score).toBe(Number.MAX_SAFE_INTEGER);
	});

	it("triggers TT LOWER alpha-beta cutoff branch with PV move", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const tt = {
			get: () => ({
				depth: 99,
				score: Number.MAX_SAFE_INTEGER,
				flag: "LOWER",
				bestMoveUci: "e2e4",
			}),
			set: () => ({}),
		};

		const result = searchBestMove(position, { depth: 2, maxNodes: 1000, tt });
		expect(result.moveUci).toBe("e2e4");
	});

	it("triggers TT UPPER alpha-beta cutoff branch", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const tt = {
			get: () => ({
				depth: 99,
				score: -Number.MAX_SAFE_INTEGER,
				flag: "UPPER",
				bestMoveUci: null,
			}),
			set: () => ({}),
		};

		const result = searchBestMove(position, { depth: 2, maxNodes: 1000, tt });
		expect(result.score).toBe(-Number.MAX_SAFE_INTEGER);
	});

	it("prefers tactical queen capture over a smaller pawn capture", () => {
		const position = parseFen("k7/8/8/2q1p3/3P4/8/8/7K w - - 0 1");
		const result = searchBestMove(position, { depth: 1, maxNodes: 50000 });

		expect(result.moveUci).toBe("d4c5");
	});

	it("handles depth-zero entry via quiescence path", () => {
		const position = parseFen("k7/8/8/2q1p3/3P4/8/8/7K w - - 0 1");
		const result = searchBestMove(position, { depth: 0, maxNodes: 50000 });

		expect(typeof result.score).toBe("number");
		expect(result.nodes).toBeGreaterThan(0);
		expect(result.searchedDepth).toBe(0);
	});

	it("supports iterative deepening and reports searchedDepth", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 4,
			maxNodes: 200000,
			iterativeDeepening: true,
		});

		expect(result.searchedDepth).toBeGreaterThan(0);
		expect(result.searchedDepth).toBeLessThanOrEqual(4);
	});

	it("supports disabling iterative deepening explicitly", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 2,
			maxNodes: 200000,
			iterativeDeepening: false,
		});

		expect(result.searchedDepth).toBe(2);
		expect(typeof result.score).toBe("number");
	});

	it("supports disabling PVS explicitly", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 200000,
			usePvs: false,
		});

		expect(result.searchedDepth).toBeGreaterThan(0);
		expect(typeof result.score).toBe("number");
	});

	it("supports disabling aspiration windows explicitly", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 4,
			maxNodes: 200000,
			aspirationWindows: false,
			iterativeDeepening: true,
		});

		expect(result.searchedDepth).toBeGreaterThan(0);
		expect(Array.isArray(result.pv)).toBe(true);
	});

	it("supports disabling null-move pruning explicitly", () => {
		const position = parseFen(
			"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		);
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 90000,
			iterativeDeepening: false,
			useNullMovePruning: false,
		});

		expect(typeof result.score).toBe("number");
		expect(result.searchedDepth).toBe(3);
	});

	it("supports disabling LMR and check extensions explicitly", () => {
		const position = parseFen(
			"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		);
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 90000,
			iterativeDeepening: false,
			useLmr: false,
			checkExtensions: false,
		});

		expect(typeof result.score).toBe("number");
		expect(result.nodes).toBeGreaterThan(0);
	}, 15000);

	it("exercises null-move pruning path on non-pawn material", () => {
		const position = parseFen(
			"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		);
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 120000,
			iterativeDeepening: false,
			useNullMovePruning: true,
		});

		expect(typeof result.score).toBe("number");
		expect(Array.isArray(result.pv)).toBe(true);
	});

	it("respects hard time cutoff guard", () => {
		const position = parseFen(
			"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		);
		let tick = 0;
		const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
			tick += 5;
			return tick;
		});

		const result = searchBestMove(position, {
			depth: 5,
			maxNodes: 500000,
			iterativeDeepening: false,
			softTimeMs: 1,
			hardTimeMs: 1,
		});

		nowSpy.mockRestore();
		expect(typeof result.score).toBe("number");
	});

	it("triggers null-move beta cutoff path", () => {
		const position = parseFen(
			"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		);
		const nullMoveFen =
			"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 4";
		const tt = {
			get: (key, side) =>
				key === nullMoveFen && side === "w"
					? {
							depth: 99,
							score: -1000000,
							flag: "EXACT",
							bestMoveUci: null,
						}
					: null,
			set: () => ({}),
		};

		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 50000,
			iterativeDeepening: true,
			aspirationWindows: true,
			useNullMovePruning: true,
			tt,
		});

		expect(result.score).toBeGreaterThan(1000);
	});

	it("breaks iterative deepening when soft time is exceeded", () => {
		const position = parseFen(
			"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		);
		let tick = 0;
		const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
			tick += 3;
			return tick;
		});

		const result = searchBestMove(position, {
			depth: 5,
			maxNodes: 400000,
			iterativeDeepening: true,
			softTimeMs: 1,
			hardTimeMs: 1000,
		});

		nowSpy.mockRestore();
		expect(result.searchedDepth).toBeLessThanOrEqual(1);
	});

	it("accepts maxTimeMs without breaking return contract", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 5,
			maxNodes: 500000,
			maxTimeMs: 1,
			iterativeDeepening: true,
		});

		expect(result.searchedDepth).toBeGreaterThanOrEqual(0);
		expect(result.searchedDepth).toBeLessThanOrEqual(5);
		expect(Array.isArray(result.pv)).toBe(true);
	});

	it("hits quiescence max-node cutoff guard", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, { depth: 0, maxNodes: 0 });

		expect(typeof result.score).toBe("number");
		expect(result.nodes).toBeGreaterThanOrEqual(1);
	});

	it("handles explicit LOWER and UPPER TT flags without crashing", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");

		const ttLower = {
			get: () => ({ depth: 99, score: 123, flag: "LOWER", bestMoveUci: null }),
			set: () => ({}),
		};
		const lowerResult = searchBestMove(position, {
			depth: 1,
			maxNodes: 2000,
			tt: ttLower,
		});
		expect(typeof lowerResult.score).toBe("number");

		const ttUpper = {
			get: () => ({
				depth: 99,
				score: -Number.MAX_SAFE_INTEGER,
				flag: "UPPER",
				bestMoveUci: null,
			}),
			set: () => ({}),
		};
		const upperResult = searchBestMove(position, {
			depth: 1,
			maxNodes: 2000,
			tt: ttUpper,
		});
		expect(typeof upperResult.score).toBe("number");
	});

	it("produces principal variation and node count", () => {
		const position = parseFen("r3k2r/8/8/8/2b5/8/8/R3K2R w KQkq - 0 1");
		const result = searchBestMove(position, { depth: 2, maxNodes: 50000 });

		expect(Array.isArray(result.pv)).toBe(true);
		expect(result.nodes).toBeGreaterThan(0);
		expect(typeof result.score).toBe("number");
	});

	it("returns null move for terminal no-legal-move positions", () => {
		const position = parseFen("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
		const result = searchBestMove(position, { depth: 2, maxNodes: 5000 });

		expect(result.move).toBeNull();
		expect(result.moveUci).toBeNull();
	});

	it("returns neutral score on stalemate-like no-legal-move states", () => {
		const position = parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
		const result = searchBestMove(position, { depth: 2, maxNodes: 5000 });

		expect(result.move).toBeNull();
		expect(result.score).toBe(0);
	});

	it("returns mate score trend on checkmated side", () => {
		const position = parseFen("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
		const result = searchBestMove(position, { depth: 3, maxNodes: 5000 });

		expect(result.score).toBeLessThan(-1000);
	});

	it("uses evaluation fallback when maxNodes budget is immediately exhausted", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, { depth: 2, maxNodes: 0 });

		expect(typeof result.score).toBe("number");
		expect(result.nodes).toBeGreaterThanOrEqual(0);
		expect(result.searchedDepth).toBe(0);
	});

	it("hits negamax max-node cutoff when iterative deepening is disabled", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 2,
			maxNodes: 0,
			iterativeDeepening: false,
		});

		expect(typeof result.score).toBe("number");
		expect(result.searchedDepth).toBe(2);
		expect(result.nodes).toBeGreaterThan(0);
	});

	it("uses custom ttSize path when tt is not provided", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 1,
			maxNodes: 1000,
			ttSize: 2,
		});

		expect(typeof result.score).toBe("number");
		expect(result.tt.size()).toBeLessThanOrEqual(2);
	});

	it("returns null move when TT exact move is not legal in current position", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const tt = {
			get: () => ({ depth: 99, score: 7, flag: "EXACT", bestMoveUci: "a1a2" }),
			set: () => ({}),
		};

		const result = searchBestMove(position, { depth: 2, maxNodes: 1000, tt });
		expect(result.move).toBeNull();
		expect(result.moveUci).toBe("a1a2");
	});
});
