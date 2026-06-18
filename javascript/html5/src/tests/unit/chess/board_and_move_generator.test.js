import { describe, expect, it } from "vitest";
import {
	cloneBoard,
	createEmptyBoard,
	getPieceAt,
	withMovedPiece,
	withPieceAt,
} from "../../../js/chess/board.js";
import { parseFen } from "../../../js/chess/fen.js";
import {
	generateLegalMoves,
	generatePseudoLegalMoves,
	moveToUci,
} from "../../../js/chess/move_generator.js";

describe("chess/board pure operations", () => {
	it("creates an empty board", () => {
		const board = createEmptyBoard();
		expect(board).toHaveLength(8);
		expect(board.every((rank) => rank.length === 8)).toBe(true);
		expect(board.flat().every((square) => square === null)).toBe(true);
	});

	it("sets and reads piece without mutating the original board", () => {
		const board = createEmptyBoard();
		const next = withPieceAt(board, 4, 4, "Q");

		expect(getPieceAt(board, 4, 4)).toBeNull();
		expect(getPieceAt(next, 4, 4)).toBe("Q");
	});

	it("moves piece immutably", () => {
		const board = withPieceAt(createEmptyBoard(), 6, 4, "P");
		const next = withMovedPiece(board, { row: 6, col: 4 }, { row: 4, col: 4 });

		expect(board[6][4]).toBe("P");
		expect(board[4][4]).toBeNull();
		expect(next[6][4]).toBeNull();
		expect(next[4][4]).toBe("P");
	});

	it("deep clones board arrays", () => {
		const board = withPieceAt(createEmptyBoard(), 0, 0, "k");
		const copy = cloneBoard(board);
		copy[0][0] = null;

		expect(board[0][0]).toBe("k");
	});

	it("throws on invalid board shape and bounds", () => {
		const invalidBoard = Array.from({ length: 7 }, () => Array(8).fill(null));
		expect(() => cloneBoard(invalidBoard)).toThrow(/8 ranks/);

		const invalidRankWidth = Array.from({ length: 8 }, () =>
			Array(8).fill(null),
		);
		invalidRankWidth[0] = Array(7).fill(null);
		expect(() => cloneBoard(invalidRankWidth)).toThrow(/8 files/);

		const board = createEmptyBoard();
		expect(() => getPieceAt(board, 8, 0)).toThrow(/range/);
		expect(() => withPieceAt(board, 0, -1, "Q")).toThrow(/range/);
	});

	it("throws on invalid piece symbol and moving from empty square", () => {
		const board = createEmptyBoard();
		expect(() => withPieceAt(board, 0, 0, "QQ")).toThrow(
			/one-character symbol/,
		);
		expect(() =>
			withMovedPiece(board, { row: 0, col: 0 }, { row: 1, col: 0 }),
		).toThrow(/empty square/);
	});
});

describe("chess/move_generator pseudo-legal generation", () => {
	it("generates 20 opening moves in the standard initial position", () => {
		const position = parseFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		const moves = generatePseudoLegalMoves(position);
		expect(moves).toHaveLength(20);
	});

	it("generates promotion options", () => {
		const position = parseFen("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
		const moves = generatePseudoLegalMoves(position).map(moveToUci);

		expect(moves).toEqual(
			expect.arrayContaining(["b7b8q", "b7b8r", "b7b8b", "b7b8n"]),
		);
	});

	it("generates en passant capture from FEN target", () => {
		const position = parseFen("4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1");
		const moves = generatePseudoLegalMoves(position).map(moveToUci);

		expect(moves).toContain("d5e6");
	});

	it("generates castling moves when path squares are clear", () => {
		const position = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
		const moves = generatePseudoLegalMoves(position).map(moveToUci);

		expect(moves).toContain("e1g1");
		expect(moves).toContain("e1c1");
	});

	it("currently maps legal move generation to pseudo-legal output", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		const pseudo = generatePseudoLegalMoves(position).map(moveToUci).sort();
		const legal = generateLegalMoves(position).map(moveToUci).sort();

		expect(legal).toEqual(pseudo);
	});

	it("ignores unknown board piece symbols by returning no moves for that square", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		const mutated = {
			...position,
			board: position.board.map((rank) => [...rank]),
		};
		mutated.board[7][3] = "X";

		const pseudo = generatePseudoLegalMoves(mutated).map(moveToUci);
		expect(pseudo).not.toContain("d1d2");
	});
});
