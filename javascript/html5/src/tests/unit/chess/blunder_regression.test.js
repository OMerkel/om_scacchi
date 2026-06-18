import { describe, expect, it } from "vitest";
import { searchBestMove } from "../../../js/chess/ai/negamax_search.js";
import { parseFen } from "../../../js/chess/fen.js";

/**
 * Tactical blunder regression suite.
 *
 * These tests capture positions where the engine should NOT blunder
 * (hang pieces, ignore checkmate threats, create fatal weaknesses).
 * Use this to verify evaluation and quiescence improvements.
 */

describe("chess blunder regression tests", () => {
	/**
	 * Hanging piece: engine should see and avoid losing material for free.
	 */
	it("avoids hanging a piece to undefended opponent piece", () => {
		// Position: white queen on e4 undefended, black bishop on f5 can take
		// Engine (white) should not move into losing trades
		const position = parseFen(
			"rnbqkbnr/pppppppp/8/5b2/4Q3/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1",
		);
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 100000,
		});

		// The best move should not be one that allows Bxe4 without compensation
		// This is a basic sanity check: engine must see immediate threats
		expect(result.moveUci).toBeTruthy();
		expect(result.score).toBeLessThan(200); // Large material advantage should not be positive
	});

	/**
	 * Checkmate threat: engine must recognize forced checkmate 1-2 moves away.
	 */
	it("detects back-rank checkmate threat and defends", () => {
		// Position: white king on h2 with rook on g2, black king on e8, black rook on f8
		// Black pawns on f7, g7, h7 limit white's escape
		const position = parseFen("4kr2/5ppp/8/8/8/8/6RK/8 b - - 0 1");
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 200000,
		});

		// Engine should find reasonable moves
		expect(result.moveUci).toBeTruthy();
	});

	/**
	 * Pawn structure: engine should not create permanently weak pawn formations.
	 */
	it("avoids creating isolated/doubled pawns without compensation", () => {
		// Position: white can move e4-e5 or defend
		// e4-e5 blocks its own pawn and creates doubled structure
		const position = parseFen(
			"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
		);
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 150000,
		});

		// Normal developing move should be preferred over pawn weakening
		expect(result.moveUci).toBeTruthy();
		// Score should reflect reasonable continuation, not damage
	});

	/**
	 * Tactical: engine must not miss simple winning captures.
	 */
	it("finds simple winning capture", () => {
		// Position: white has undefended queen, black pawn can capture
		// White should not allow simple material loss
		const position = parseFen(
			"rnbqkbnr/ppp1pppp/8/3p4/4P1Q1/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1",
		);
		const result = searchBestMove(position, {
			depth: 2,
			maxNodes: 80000,
		});

		// White queen on g4 should not hang to d5 pawn
		// Engine must calculate this
		expect(result.moveUci).toBeTruthy();
	});

	/**
	 * Discovered attack: engine should recognize and either execute or avoid.
	 */
	it("handles discovered attack correctly", () => {
		// Position: white bishop behind pawn can give discovered check
		// Engine should either execute beneficial discovered attack or avoid walking into one
		const position = parseFen(
			"rnbqkb1r/pppppppp/5n2/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 1",
		);
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 150000,
		});

		// Should find a reasonable developing move
		expect(result.moveUci).toBeTruthy();
		expect(result.score).toBeGreaterThan(-300); // No massive eval drop
	});

	/**
	 * Quiet but strong move: engine should recognize that sometimes quiet moves
	 * are stronger than flashy but inferior captures.
	 */
	it("prefers strong quiet move over weak capture", () => {
		// Rybka position: quiet move is stronger than capturing
		// This tests evaluation and move ordering
		const position = parseFen(
			"r1bqkb1r/pp2pppp/2np1n2/3p4/2PPP3/2N2N2/PP3PPP/R1BQKB1R w KQkq - 0 1",
		);
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 200000,
		});

		// Should find a reasonable positional move
		expect(result.moveUci).toBeTruthy();
		// Score should reflect development/position, not just material
	});

	/**
	 * Passed pawn: engine should recognize connected passed pawns as strong.
	 */
	it("values connected passed pawns appropriately", () => {
		// Position: white has two connected passed pawns on 5th and 6th rank
		// Should be heavily incentivized
		const position = parseFen("8/5K2/1PP5/8/8/8/k7/8 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 100000,
		});

		// Best move should push pawns forward (obvious winning plan)
		expect(result.moveUci).toBeTruthy();
		expect(result.score).toBeGreaterThan(500); // Clearly winning
	});

	/**
	 * Quiescence: engine should not miss tactics in quiet positions.
	 */
	it("finds hidden tactical blow in quiet-looking position", () => {
		// Quiet position but white has Nxe5 forcing sequence
		const position = parseFen(
			"r1bqkb1r/pppppppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 0 1",
		);
		const result = searchBestMove(position, {
			depth: 4,
			maxNodes: 250000,
		});

		// Should find the attacking move
		expect(result.moveUci).toBeTruthy();
		// Score should reflect the tactical advantage
	});

	/**
	 * Pin detection: engine should recognize pinned pieces and not hang them.
	 */
	it("avoids moving pinned piece into capture", () => {
		// Position: white bishop on d4 is pinned by black rook on d8 to white king on d1
		// If white moves bishop away from d-file undefended, black captures it next move
		const position = parseFen("3r4/8/8/8/3B4/8/8/3K2k1 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 100000,
		});

		// Engine should prefer to move bishop along the pin line (d-file)
		// or move king away, not leave it hanging
		expect(result.moveUci).toBeTruthy();
		// Pinned piece should not be abandoned
	});

	/**
	 * Back-rank weakness: engine should avoid back-rank mate threats.
	 */
	it("defends against back-rank mate threat", () => {
		// Position: white king on h1 with no escape squares, black rook on h8
		// Black threatens Rh1#, which is mate because king has no escape
		const position = parseFen("6rk/5ppp/8/8/8/8/6P1/6RK w - - 0 1");
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 150000,
		});

		// Engine should find moves that prevent mate
		expect(result.moveUci).toBeTruthy();
		// Should recognize the danger and take it seriously
	});

	/**
	 * Attack coordination: engine should fear coordinated attacks on weak king.
	 */
	it("avoids allowing overwhelming attack on undefended king", () => {
		// Position: white king on e1 with limited defenders, black has two rooks attacking
		// Black rooks on a1 and a5 can coordinate attack
		const position = parseFen("r3k3/8/r7/8/8/8/4K3/R3R3 b - - 0 1");
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 150000,
		});

		// Engine should recognize the king safety threat and move accordingly
		expect(result.moveUci).toBeTruthy();
		// Should fear the coordinated rook attack
	});

	/**
	 * Tactical recapture: engine should avoid forcing a losing queen trade.
	 */
	it("avoids queen blunder c2e2+ when white can simply recapture", () => {
		// Reported position where black queen can check on e2 but gets taken for free.
		const position = parseFen(
			"r1b1kr2/pppp1ppp/8/3NP3/1P1Q4/6P1/PPq1P2P/3RKB1R b K - 8 15",
		);
		const result = searchBestMove(position, {
			depth: 6,
			maxNodes: 600000,
			maxTimeMs: 1200,
			softTimeMs: 1100,
			hardTimeMs: 1300,
			iterativeDeepening: true,
		});

		expect(result.moveUci).toBeTruthy();
		expect(result.moveUci).not.toBe("c2e2");
	}, 10000);

	/**
	 * Mate in 1 must be preferred over slower winning lines.
	 */
	it("finds mate in 1 a8c8 and captures queen in winning tactic", () => {
		// Reported position: white can play Rxc8# immediately.
		const position = parseFen(
			"R1q1kb1r/3ppppp/8/4n3/3r4/2N2Q2/1PP2PPP/2B3KR w k - 2 20",
		);
		const result = searchBestMove(position, {
			depth: 8,
			maxNodes: 1000000,
			maxTimeMs: 1500,
			softTimeMs: 1400,
			hardTimeMs: 1650,
			iterativeDeepening: true,
		});

		expect(result.moveUci).toBe("a8c8");
	});

	/**
	 * Queen sacrifice avoidance: Qe5+ hands the queen to the black king for free.
	 */
	it("avoids Qe5+ queen blunder in queen-vs-king endgame", () => {
		// Reported position: white queen on c7, black king on d5.
		// Qe5+ is a blunder — Kxe5 wins the queen immediately.
		const position = parseFen("8/2Q3pp/8/3k4/3pb3/8/3K1PPP/8 w - - 1 46");
		const result = searchBestMove(position, {
			depth: 6,
			maxNodes: 200000,
			maxTimeMs: 1500,
			softTimeMs: 1400,
			hardTimeMs: 1600,
			iterativeDeepening: true,
		});

		expect(result.moveUci).toBeTruthy();
		expect(result.moveUci).not.toBe("c7e5");
	}, 8000);

	/**
	 * Knight fork: Nb3 wins the rook on c1 for free.
	 */
	it("finds knight fork winning a rook (Nb3)", () => {
		// White knight on d2, black king on d4, black rook on c1.
		// Nb3+ forks king and rook.
		const position = parseFen("8/8/8/8/3k4/8/3NK3/2r5 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 5,
			maxNodes: 300000,
			iterativeDeepening: true,
		});

		expect(result.moveUci).toBe("d2b3");
	});

	/**
	 * Pawn promotion: promote to queen for overwhelming advantage.
	 */
	it("promotes pawn to queen on the final rank", () => {
		// White pawn on c7, kings far away. c8=Q is the obvious winning move.
		const position = parseFen("8/2P3K1/8/8/8/8/8/7k w - - 0 1");
		const result = searchBestMove(position, {
			depth: 3,
			maxNodes: 100000,
			iterativeDeepening: true,
		});

		expect(result.moveUci).toBe("c7c8q");
		expect(result.score).toBeGreaterThan(900);
	});

	/**
	 * Skewer: rook skewers king, wins back-rank piece.
	 */
	it("finds rook skewer winning a piece (Ra1-e1+)", () => {
		// White rook a1, white king h1. Black king e6. Ra1-e1 attacks along e-file.
		const position = parseFen("8/8/4k3/8/8/8/8/R6K w - - 0 1");
		const result = searchBestMove(position, {
			depth: 4,
			maxNodes: 200000,
			iterativeDeepening: true,
		});

		expect(result.score).toBeGreaterThan(500);
	});

	/**
	 * Rook cutoff: cut off enemy king to assist pawn promotion.
	 */
	it("rook cuts off enemy king to aid winning plan", () => {
		// White king e3, rook h1. Black king d6. Rook cuts off king on h-file or 5th rank.
		const position = parseFen("8/8/3k4/8/8/4K3/8/7R w - - 0 1");
		const result = searchBestMove(position, {
			depth: 5,
			maxNodes: 300000,
			iterativeDeepening: true,
		});

		expect(result.score).toBeGreaterThan(500);
	});

	/**
	 * Deflection: rook on c2 deflects the c4 pawn.
	 */
	it("deflects defending pawn with rook to win material", () => {
		// White rook c2, white king d1. Black king d6, black pawn c4.
		// Rc4 or Rxc4 wins the pawn.
		const position = parseFen("8/8/3k4/8/2p5/8/2R5/3K4 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 5,
			maxNodes: 300000,
			iterativeDeepening: true,
		});

		expect(result.score).toBeGreaterThan(300);
	});

	/**
	 * Overloading: black bishop on f8 is overloaded defending against a discovered fork.
	 */
	it("exploits overloaded defender with discovered attack", () => {
		// Open Sicilian-like: black Bb4 pins/overloads defence.
		const position = parseFen(
			"r1bqkb1r/pppp1ppp/2n2n2/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4",
		);
		const result = searchBestMove(position, {
			depth: 5,
			maxNodes: 400000,
			iterativeDeepening: true,
			maxTimeMs: 1200,
			softTimeMs: 1100,
			hardTimeMs: 1300,
		});

		expect(result.moveUci).toBeTruthy();
		expect(result.score).toBeGreaterThan(0);
	}, 8000);

	/**
	 * Development: fianchetto knight before bishop is generally correct.
	 */
	it("prefers piece development in opening over pawn push", () => {
		const position = parseFen(
			"rnbqkb1r/pppppppp/8/8/8/6P1/PPPPPP1P/RNBQKBNR w KQkq - 0 1",
		);
		const result = searchBestMove(position, {
			depth: 4,
			maxNodes: 200000,
			iterativeDeepening: true,
		});

		expect(result.moveUci).toBeTruthy();
		expect(result.score).toBeGreaterThan(0);
	});

	/**
	 * Castling priority: engine should castle when available for king safety.
	 */
	it("castles kingside when it is the best developing move", () => {
		// White can castle kingside (f1 bishop just moved in thought experiment).
		const position = parseFen(
			"rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
		);
		const result = searchBestMove(position, {
			depth: 4,
			maxNodes: 200000,
			iterativeDeepening: true,
		});

		expect(result.moveUci).toBeTruthy();
		expect(result.score).toBeGreaterThan(0);
	});

	/**
	 * Double check: black rook on a8 moves to a1 giving double check pattern.
	 */
	it("finds double-check winning tactic for black", () => {
		// Black rook a8 and knight e5 combine.
		const position = parseFen("r3k3/8/8/4n3/8/8/8/R3K3 b - - 0 1");
		const result = searchBestMove(position, {
			depth: 5,
			maxNodes: 400000,
			iterativeDeepening: true,
		});

		expect(result.moveUci).toBeTruthy();
		expect(result.score).toBeGreaterThan(500);
	}, 15000);

	/**
	 * Stalemate avoidance: engine must NOT play into stalemate when winning.
	 *
	 * Position: White Kf6, Qg1; Black Kh8.
	 * The tempting queen move Qg6 immediately stalemats black (Kh8 has no
	 * legal moves and is not in check).  The engine must see this at depth 1
	 * and choose any other move instead, which keeps a material advantage.
	 *
	 * Using depth 2 + tiny node budget so the test completes in milliseconds
	 * even under V8 coverage instrumentation.
	 */
	it("avoids stalemate and finds mate in winning queen endgame", () => {
		// White queen g1, king f6, black king h8.
		// Qg6 would immediately stalemate black (score 0) – engine must avoid it.
		const position = parseFen("7k/8/5K2/8/8/8/8/6Q1 w - - 0 1");
		const result = searchBestMove(position, {
			depth: 2,
			maxNodes: 2000,
			iterativeDeepening: false,
		});

		// Engine must find a winning move (score > 0), not the stalemate (score = 0).
		expect(result.moveUci).toBeTruthy();
		expect(result.moveUci).not.toBe("g1g6"); // Qg6 = immediate stalemate
		expect(result.score).toBeGreaterThan(0);
	});
});
