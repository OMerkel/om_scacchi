import { describe, expect, it } from "vitest";
import { parseFen } from "../../../js/chess/fen.js";
import {
	generateLegalMoves,
	generatePseudoLegalMoves,
	moveToUci,
} from "../../../js/chess/move_generator.js";
import {
	applyMove,
	isKingInCheck,
	isSquareAttacked,
} from "../../../js/chess/rules.js";

describe("chess/rules king safety and attacks", () => {
	it("detects attacked squares", () => {
		const position = parseFen("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
		expect(isSquareAttacked(position, 7, 4, "b")).toBe(true);
	});

	it("treats missing king as in-check safeguard", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		position.board[7][4] = null;
		expect(isKingInCheck(position, "w")).toBe(true);
	});

	it("detects check against side king", () => {
		const position = parseFen("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
		expect(isKingInCheck(position, "w")).toBe(true);
		expect(isKingInCheck(position, "b")).toBe(false);
	});
});

describe("chess/rules applyMove", () => {
	it("applies castling and moves rook", () => {
		const position = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
		const move = generateLegalMoves(position).find(
			(candidate) => moveToUci(candidate) === "e1g1",
		);
		expect(move).toBeTruthy();

		const next = applyMove(position, move);
		expect(next.board[7][6]).toBe("K");
		expect(next.board[7][5]).toBe("R");
		expect(next.castling.includes("K")).toBe(false);
		expect(next.castling.includes("Q")).toBe(false);
	});

	it("throws when applying a move from an empty square", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		const emptySquareMove = {
			from: { row: 4, col: 4 },
			to: { row: 3, col: 4 },
			flags: {},
		};
		expect(() => applyMove(position, emptySquareMove)).toThrow(
			"Cannot apply move from empty square",
		);
	});

	it("applies en passant capture correctly", () => {
		const position = parseFen("4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1");
		const move = generateLegalMoves(position).find(
			(candidate) => moveToUci(candidate) === "d5e6",
		);
		expect(move).toBeTruthy();

		const next = applyMove(position, move);
		expect(next.board[2][4]).toBe("P");
		expect(next.board[3][4]).toBeNull();
		expect(next.enPassant).toBe("-");
	});
});

describe("chess/legal move filtering", () => {
	it("filters pseudo-legal king moves into legal set when in check", () => {
		const position = parseFen("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
		const pseudo = generatePseudoLegalMoves(position).map(moveToUci);
		const legal = generateLegalMoves(position).map(moveToUci);

		expect(pseudo.length).toBeGreaterThanOrEqual(legal.length);
		expect(legal).toContain("e1e2");
		expect(legal).not.toContain("e1d2");
	});

	it("forbids castling through attacked squares", () => {
		const position = parseFen("r3k2r/8/8/8/2b5/8/8/R3K2R w KQkq - 0 1");
		const legal = generateLegalMoves(position).map(moveToUci);

		expect(legal).not.toContain("e1g1");
		expect(legal).toContain("e1c1");
	});

	it("forbids moving pinned rook that exposes own king", () => {
		const position = parseFen("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1");
		const legal = generateLegalMoves(position).map(moveToUci);

		expect(legal).toContain("e2e8");
		expect(legal).toContain("e2e3");
		expect(legal).not.toContain("e2d2");
		expect(legal).not.toContain("e2f2");
	});
});
