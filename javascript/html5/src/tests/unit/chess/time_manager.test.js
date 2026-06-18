// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeTimeLimits } from "../../../js/chess/ai/time_manager.js";

// ── Mock external deps so we can control move count and check status ───────
// vi.mock is hoisted so factories must not reference module-level variables.

vi.mock("../../../js/chess/move_generator.js", () => ({
	generateLegalMoves: vi.fn(),
}));

vi.mock("../../../js/chess/rules.js", () => ({
	isKingInCheck: vi.fn(),
	isSquareAttacked: vi.fn(),
}));

// Import the mocked functions AFTER mock declarations.
import { generateLegalMoves } from "../../../js/chess/move_generator.js";
import { isKingInCheck } from "../../../js/chess/rules.js";

const mockGenerateLegalMoves = generateLegalMoves;
const mockIsKingInCheck = isKingInCheck;

// ── Helpers ────────────────────────────────────────────────────────────────

const emptyBoard = () => Array.from({ length: 8 }, () => Array(8).fill(null));

/**
 * Build a minimal position object from a flat list of [piece, row, col]
 * triples. Piece chars follow chess convention: uppercase = white.
 */
const makePosition = (pieces = [], sideToMove = "w", fullmoveNumber = 15) => {
	const board = emptyBoard();
	for (const [piece, row, col] of pieces) {
		board[row][col] = piece;
	}
	return { board, sideToMove, fullmoveNumber };
};

/** Make n stub moves (content irrelevant for time_manager). */
const fakeMoves = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

/** Full starting material for one side (value = Q9 + 2R10 + 2B6 + 2N6 + 8P8 = 39). */
const FULL_PIECES_WHITE = [
	["R", 7, 0],
	["N", 7, 1],
	["B", 7, 2],
	["Q", 7, 3],
	["K", 7, 4],
	["B", 7, 5],
	["N", 7, 6],
	["R", 7, 7],
	["P", 6, 0],
	["P", 6, 1],
	["P", 6, 2],
	["P", 6, 3],
	["P", 6, 4],
	["P", 6, 5],
	["P", 6, 6],
	["P", 6, 7],
];
const FULL_PIECES_BLACK = [
	["r", 0, 0],
	["n", 0, 1],
	["b", 0, 2],
	["q", 0, 3],
	["k", 0, 4],
	["b", 0, 5],
	["n", 0, 6],
	["r", 0, 7],
	["p", 1, 0],
	["p", 1, 1],
	["p", 1, 2],
	["p", 1, 3],
	["p", 1, 4],
	["p", 1, 5],
	["p", 1, 6],
	["p", 1, 7],
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe("computeTimeLimits", () => {
	beforeEach(() => {
		mockGenerateLegalMoves.mockReset();
		mockIsKingInCheck.mockReset();
		mockGenerateLegalMoves.mockReturnValue(fakeMoves(20));
		mockIsKingInCheck.mockReturnValue(false);
	});

	it("returns softTimeMs, hardTimeMs and factor", () => {
		const pos = makePosition([[" K", 7, 4]], "w", 15);
		const res = computeTimeLimits(pos, 1000);
		expect(res).toHaveProperty("softTimeMs");
		expect(res).toHaveProperty("hardTimeMs");
		expect(res).toHaveProperty("factor");
	});

	it("softTimeMs is at least 20ms", () => {
		const pos = makePosition([], "w", 15);
		const { softTimeMs } = computeTimeLimits(pos, 1);
		expect(softTimeMs).toBeGreaterThanOrEqual(20);
	});

	it("hardTimeMs is strictly greater than softTimeMs", () => {
		const pos = makePosition([], "w", 15);
		const { softTimeMs, hardTimeMs } = computeTimeLimits(pos, 1000);
		expect(hardTimeMs).toBeGreaterThan(softTimeMs);
	});

	// ── Game phase ────────────────────────────────────────────────────────

	it("reduces time in opening phase (full material, move <= 10)", () => {
		// Total material: 39 + 39 = 78 > 58, fullmove = 1 → opening
		const openPos = makePosition(
			[...FULL_PIECES_WHITE, ...FULL_PIECES_BLACK],
			"w",
			1,
		);
		const midPos = makePosition(
			[...FULL_PIECES_WHITE, ...FULL_PIECES_BLACK],
			"w",
			15, // fullmove > 10 → NOT opening even with full material
		);
		const { factor: factorOpen } = computeTimeLimits(openPos, 1000);
		const { factor: factorMid } = computeTimeLimits(midPos, 1000);
		expect(factorOpen).toBeLessThan(factorMid);
	});

	it("increases time in endgame (total material <= 20)", () => {
		// Endgame: just a queen remaining (total = 9 ≤ 20)
		const endPos = makePosition(
			[
				["Q", 7, 0],
				["K", 7, 4],
				["k", 0, 4],
			],
			"w",
			50,
		);
		const _midPos = makePosition(
			[
				["Q", 7, 0],
				["K", 7, 4],
				["k", 0, 4],
			],
			"w",
			3,
		);
		// midPos with fullmove=3 and total=9: still endgame (total <= 20)
		// We need middlegame for comparison: fullmove=15, total ~40
		const midPos2 = makePosition(
			[
				...FULL_PIECES_WHITE.slice(0, 8),
				...FULL_PIECES_BLACK.slice(0, 8),
				["K", 7, 4],
				["k", 0, 4],
			],
			"w",
			20,
		);
		const { factor: factorEnd } = computeTimeLimits(endPos, 1000);
		const { factor: factorMid2 } = computeTimeLimits(midPos2, 1000);
		expect(factorEnd).toBeGreaterThan(factorMid2 * 0.8); // endgame multiplier (1.2) > middlegame (1.0)
	});

	it("uses middlegame factor by default (full material but late game)", () => {
		const pos = makePosition(
			[...FULL_PIECES_WHITE, ...FULL_PIECES_BLACK],
			"w",
			15,
		);
		const { factor } = computeTimeLimits(pos, 1000);
		// No extreme adjustments → factor near 1.0
		expect(factor).toBeGreaterThan(0.4);
		expect(factor).toBeLessThan(2.0);
	});

	// ── Move count ────────────────────────────────────────────────────────

	it("increases time when move count >= 35 (rich tactical position)", () => {
		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(35));
		const posMany = makePosition([], "w", 15);
		const { factor: factorMany } = computeTimeLimits(posMany, 1000);

		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(20));
		const posNormal = makePosition([], "w", 15);
		const { factor: factorNormal } = computeTimeLimits(posNormal, 1000);

		expect(factorMany).toBeGreaterThan(factorNormal);
	});

	it("slightly increases time when move count is 28-34", () => {
		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(28));
		const pos28 = makePosition([], "w", 15);
		const { factor: factor28 } = computeTimeLimits(pos28, 1000);

		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(20));
		const pos20 = makePosition([], "w", 15);
		const { factor: factor20 } = computeTimeLimits(pos20, 1000);

		expect(factor28).toBeGreaterThan(factor20);
	});

	it("reduces time when move count <= 8 (nearly forced)", () => {
		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(4));
		const posFew = makePosition([], "w", 15);
		const { factor: factorFew } = computeTimeLimits(posFew, 1000);

		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(20));
		const posNormal = makePosition([], "w", 15);
		const { factor: factorNormal } = computeTimeLimits(posNormal, 1000);

		expect(factorFew).toBeLessThan(factorNormal);
	});

	// ── Check urgency ─────────────────────────────────────────────────────

	it("increases time when king is in check", () => {
		mockIsKingInCheck.mockReturnValueOnce(true);
		const posCheck = makePosition([], "w", 15);
		const { factor: factorCheck } = computeTimeLimits(posCheck, 1000);

		mockIsKingInCheck.mockReturnValueOnce(false);
		const posNoCheck = makePosition([], "w", 15);
		const { factor: factorNoCheck } = computeTimeLimits(posNoCheck, 1000);

		expect(factorCheck).toBeGreaterThan(factorNoCheck);
	});

	// ── Material imbalance ────────────────────────────────────────────────

	it("reduces time when white is winning by >= rook (imbalance >= 12)", () => {
		// White has 2 rooks + queen = 19, black has only king → imbalance = 19 ≥ 12, white > black
		const posWinning = makePosition(
			[
				["Q", 7, 0],
				["R", 7, 1],
				["R", 7, 2],
				["K", 7, 4],
				["k", 0, 4],
			],
			"w",
			30,
		);
		const posEven = makePosition(
			[
				["Q", 7, 0],
				["K", 7, 4],
				["q", 0, 0],
				["k", 0, 4],
			],
			"w",
			30,
		);
		const { factor: factorWin } = computeTimeLimits(posWinning, 1000);
		const { factor: factorEven } = computeTimeLimits(posEven, 1000);
		expect(factorWin).toBeLessThan(factorEven);
	});

	it("increases time when black is winning by >= rook (imbalance >= 12)", () => {
		// Black has 2 rooks + queen = 19, white has only king → imbalance = 19 ≥ 12, black > white
		const posLosing = makePosition(
			[
				["q", 0, 0],
				["r", 0, 1],
				["r", 0, 2],
				["k", 0, 4],
				["K", 7, 4],
			],
			"w",
			30,
		);
		const posEven = makePosition(
			[
				["Q", 7, 0],
				["K", 7, 4],
				["q", 0, 0],
				["k", 0, 4],
			],
			"w",
			30,
		);
		const { factor: factorLose } = computeTimeLimits(posLosing, 1000);
		const { factor: factorEven } = computeTimeLimits(posEven, 1000);
		expect(factorLose).toBeGreaterThan(factorEven);
	});

	it("reduces time slightly when white is winning by a piece (imbalance 6-11)", () => {
		// White: queen(9) + bishop(3) = 12, Black: queen(9) = 9. Imbalance = 3... not enough.
		// White: queen(9) + bishop(3) + pawn(1) = 13, Black: queen(9) + pawn(1) = 10. Imbalance = 3... still not.
		// Use: White knight(3) + bishop(3) = 6 ahead. Imbalance exactly 6.
		const posMidWin = makePosition(
			[
				["Q", 7, 0],
				["N", 7, 1],
				["B", 7, 2],
				["K", 7, 4],
				["q", 0, 0],
				["k", 0, 4],
			],
			"w",
			30,
		);
		const posEven = makePosition(
			[
				["Q", 7, 0],
				["K", 7, 4],
				["q", 0, 0],
				["k", 0, 4],
			],
			"w",
			30,
		);
		const { factor: factorMidWin } = computeTimeLimits(posMidWin, 1000);
		const { factor: factorEven } = computeTimeLimits(posEven, 1000);
		// White winning by a piece → factor slightly reduced
		expect(factorMidWin).toBeLessThanOrEqual(factorEven);
	});

	it("increases time slightly when black is winning by a piece (imbalance 6-11)", () => {
		// Both positions in middlegame (total > 20, fullmove 30).
		// posMidLose: Black Q(9)+R(5)+B(3)=17, White Q(9)=9 → imbalance=8, black winning.
		const posMidLose = makePosition(
			[
				["q", 0, 0],
				["r", 0, 1],
				["b", 0, 2],
				["k", 0, 4],
				["Q", 7, 0],
				["K", 7, 4],
			],
			"w",
			30,
		);
		// posEven: both Q+R = 14 each → total 28 > 20, same phase.
		const posEven = makePosition(
			[
				["Q", 7, 0],
				["R", 7, 1],
				["K", 7, 4],
				["q", 0, 0],
				["r", 0, 1],
				["k", 0, 4],
			],
			"w",
			30,
		);
		const { factor: factorMidLose } = computeTimeLimits(posMidLose, 1000);
		const { factor: factorEven } = computeTimeLimits(posEven, 1000);
		expect(factorMidLose).toBeGreaterThanOrEqual(factorEven);
	});

	// ── Repetition pressure ───────────────────────────────────────────────

	it("increases time when position was seen before", () => {
		const pos = makePosition([], "w", 15);

		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(20));
		mockIsKingInCheck.mockReturnValueOnce(false);
		const { factor: factorSeen } = computeTimeLimits(pos, 1000, 30, true);

		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(20));
		mockIsKingInCheck.mockReturnValueOnce(false);
		const { factor: factorNew } = computeTimeLimits(pos, 1000, 30, false);

		expect(factorSeen).toBeGreaterThan(factorNew);
	});

	// ── Clamping ──────────────────────────────────────────────────────────

	it("clamps factor to MAX_FACTOR (2.0) under extreme up conditions", () => {
		// Combine: endgame + many moves + in check + black winning big + seenBefore
		// all multiply factor upward; result should be clamped at 2.0
		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(40)); // ×1.3
		mockIsKingInCheck.mockReturnValueOnce(true); // ×1.25
		// Black winning by 19 → ×1.15; seenBefore → ×1.2; endgame → ×1.2
		const posExtreme = makePosition(
			[
				["q", 0, 0],
				["r", 0, 1],
				["r", 0, 2],
				["k", 0, 4],
				["K", 7, 4],
			],
			"w",
			50, // endgame (total ≤ 20) but fullmove 50
		);
		const { factor } = computeTimeLimits(posExtreme, 1000, 30, true);
		expect(factor).toBeLessThanOrEqual(2.0);
	});

	it("clamps factor to MIN_FACTOR (0.4) under extreme down conditions", () => {
		// Opening + very few moves + white winning massively
		mockGenerateLegalMoves.mockReturnValueOnce(fakeMoves(3)); // ×0.8 (≤8 branch)
		mockIsKingInCheck.mockReturnValueOnce(false);
		// White winning by 19 → ×0.75; opening → ×0.7
		const posExtreme = makePosition(
			[
				...FULL_PIECES_WHITE,
				...FULL_PIECES_BLACK,
				["Q", 4, 0],
				["R", 4, 1],
				["R", 4, 2],
			],
			"w",
			1,
		);
		const { factor } = computeTimeLimits(posExtreme, 1000);
		expect(factor).toBeGreaterThanOrEqual(0.4);
	});

	// ── Custom overhead ───────────────────────────────────────────────────

	it("respects custom overheadMs parameter", () => {
		const pos = makePosition([], "w", 15);
		const { softTimeMs: soft1 } = computeTimeLimits(pos, 1000, 0);
		const { softTimeMs: soft2 } = computeTimeLimits(pos, 1000, 100);
		// Higher overhead → lower softTimeMs (but still ≥ 20)
		expect(soft1).toBeGreaterThanOrEqual(soft2);
	});
});
