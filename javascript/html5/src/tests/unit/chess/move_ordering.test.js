import { describe, expect, it } from "vitest";
import {
	orderQuiescenceMoves,
	scoreMvvLva,
	staticExchangeEvaluation,
} from "../../../js/chess/ai/move_ordering.js";
import { parseFen } from "../../../js/chess/fen.js";
import {
	generatePseudoLegalMoves,
	moveToUci,
} from "../../../js/chess/move_generator.js";

describe("chess/ai MVV-LVA", () => {
	it("scores larger victim captures higher for the same attacker", () => {
		const position = parseFen("4k3/8/8/2q1p3/3P4/8/8/4K3 w - - 0 1");
		const captures = generatePseudoLegalMoves(position).filter(
			(move) => move.flags?.capture,
		);

		const d4c5 = captures.find((move) => moveToUci(move) === "d4c5");
		const d4e5 = captures.find((move) => moveToUci(move) === "d4e5");

		expect(d4c5).toBeTruthy();
		expect(d4e5).toBeTruthy();
		expect(scoreMvvLva(position, d4c5)).toBeGreaterThan(
			scoreMvvLva(position, d4e5),
		);
	});
});

describe("chess/ai SEE", () => {
	it("returns negative score for clearly losing capture with recapture", () => {
		const position = parseFen("4k3/8/8/8/3q4/4P3/8/4K3 b - - 0 1");
		const capture = generatePseudoLegalMoves(position).find(
			(move) => moveToUci(move) === "d4e3",
		);

		expect(capture).toBeTruthy();
		expect(staticExchangeEvaluation(position, capture)).toBeLessThan(0);
	});

	it("returns zero SEE and MVV-LVA for quiet moves", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const quiet = generatePseudoLegalMoves(position).find(
			(move) => moveToUci(move) === "e2e3",
		);

		expect(quiet).toBeTruthy();
		expect(scoreMvvLva(position, quiet)).toBe(0);
		expect(staticExchangeEvaluation(position, quiet)).toBe(0);
	});

	it("scores en-passant as a real capture", () => {
		const position = parseFen("4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1");
		const enPassant = generatePseudoLegalMoves(position).find(
			(move) => moveToUci(move) === "d5e6",
		);

		expect(enPassant).toBeTruthy();
		expect(scoreMvvLva(position, enPassant)).toBeGreaterThan(0);
	});

	it("scores black-side en-passant capture path", () => {
		const position = parseFen("4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
		const enPassant = generatePseudoLegalMoves(position).find(
			(move) => moveToUci(move) === "d4e3",
		);

		expect(enPassant).toBeTruthy();
		expect(scoreMvvLva(position, enPassant)).toBeGreaterThan(0);
	});

	it("applies SEE promotion branch on capturing promotion moves", () => {
		const position = parseFen("r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
		const capturePromotion = generatePseudoLegalMoves(position).find(
			(move) => moveToUci(move) === "b7a8q",
		);

		expect(capturePromotion).toBeTruthy();
		expect(
			staticExchangeEvaluation(position, capturePromotion),
		).toBeGreaterThan(0);
	});

	it("handles unknown promotion token with safe fallback value", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		const weirdPromotionCapture = {
			from: { row: 6, col: 4 },
			to: { row: 5, col: 4 },
			flags: { capture: true, promotion: "x" },
		};

		expect(() => scoreMvvLva(position, weirdPromotionCapture)).not.toThrow();
		expect(() =>
			staticExchangeEvaluation(position, weirdPromotionCapture),
		).not.toThrow();
	});

	it("handles malformed capture with missing attacker piece defensively", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		const malformed = {
			from: { row: 3, col: 3 },
			to: { row: 3, col: 4 },
			flags: { capture: true },
		};

		expect(scoreMvvLva(position, malformed)).toBe(0);
	});
});

describe("chess/ai quiescence ordering", () => {
	it("prioritizes tt move when provided", () => {
		const position = parseFen("4k3/8/8/2q1p3/3P4/8/8/4K3 w - - 0 1");
		const captures = generatePseudoLegalMoves(position).filter(
			(move) => move.flags?.capture,
		);

		const ordered = orderQuiescenceMoves(position, captures, {
			ttMoveUci: "d4e5",
		}).map(moveToUci);
		expect(ordered[0]).toBe("d4e5");
	});

	it("puts tactical captures before non-tactical quiet moves", () => {
		const position = parseFen("k7/8/8/2q1p3/3P4/8/8/7K w - - 0 1");
		const pseudo = generatePseudoLegalMoves(position);

		const ordered = orderQuiescenceMoves(position, pseudo).map(moveToUci);
		const captureIndex = ordered.indexOf("d4c5");
		const quietIndex = ordered.indexOf("d4d5");

		expect(captureIndex).toBeGreaterThanOrEqual(0);
		expect(quietIndex).toBeGreaterThanOrEqual(0);
		expect(captureIndex).toBeLessThan(quietIndex);
	});

	it("prioritizes promotion moves above quiet king moves", () => {
		const position = parseFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
		const pseudo = generatePseudoLegalMoves(position);
		const ordered = orderQuiescenceMoves(position, pseudo).map(moveToUci);

		const promotionIndex = ordered.indexOf("a7a8q");
		const quietKingIndex = ordered.indexOf("e1d1");

		expect(promotionIndex).toBeGreaterThanOrEqual(0);
		expect(quietKingIndex).toBeGreaterThanOrEqual(0);
		expect(promotionIndex).toBeLessThan(quietKingIndex);
	});

	it("prioritizes quiet checking moves over non-check quiet moves", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4R2K w - - 0 1");
		const pseudo = generatePseudoLegalMoves(position);
		const ordered = orderQuiescenceMoves(position, pseudo).map(moveToUci);

		const checkMoveIndex = ordered.indexOf("e1e7");
		const quietMoveIndex = ordered.indexOf("e1d1");

		expect(checkMoveIndex).toBeGreaterThanOrEqual(0);
		expect(quietMoveIndex).toBeGreaterThanOrEqual(0);
		expect(checkMoveIndex).toBeLessThan(quietMoveIndex);
	});

	it("keeps stable order for equal-score quiet moves", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		const pseudo = generatePseudoLegalMoves(position).filter((move) =>
			["e1d1", "e1f1"].includes(moveToUci(move)),
		);

		const ordered = orderQuiescenceMoves(position, pseudo).map(moveToUci);
		expect(ordered).toEqual(["e1d1", "e1f1"]);
	});

	it("handles unknown promotion token in ordering fallback", () => {
		const position = parseFen("4k3/4P3/8/8/8/8/8/4K3 w - - 0 1");
		const malformedPromotion = {
			from: { row: 1, col: 4 },
			to: { row: 0, col: 4 },
			flags: { promotion: "x" },
		};

		const ordered = orderQuiescenceMoves(position, [malformedPromotion]);
		expect(ordered).toHaveLength(1);
	});
});
