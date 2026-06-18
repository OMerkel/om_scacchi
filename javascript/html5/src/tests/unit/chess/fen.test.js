import { describe, expect, it } from "vitest";
import {
	clonePosition,
	coordsToSquare,
	createInitialPosition,
	isValidFen,
	parseFen,
	STANDARD_INITIAL_FEN,
	serializeFen,
	squareToCoords,
} from "../../../js/chess/fen.js";

describe("chess/fen parse and serialize", () => {
	it("parses standard initial FEN", () => {
		const position = parseFen(STANDARD_INITIAL_FEN);

		expect(position.sideToMove).toBe("w");
		expect(position.castling).toBe("KQkq");
		expect(position.enPassant).toBe("-");
		expect(position.halfmoveClock).toBe(0);
		expect(position.fullmoveNumber).toBe(1);
		expect(position.board).toHaveLength(8);
		expect(position.board.every((rank) => rank.length === 8)).toBe(true);

		expect(position.board[0][4]).toBe("k");
		expect(position.board[7][4]).toBe("K");
	});

	it("serializes parsed position back to the same FEN", () => {
		const fen =
			"r3k2r/pppq1ppp/2npbn2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b kq - 4 8";
		const position = parseFen(fen);

		expect(serializeFen(position)).toBe(fen);
	});

	it("normalizes castling order while serializing", () => {
		const fen =
			"r3k2r/pppq1ppp/2npbn2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b qk - 4 8";
		const position = parseFen(fen);

		expect(position.castling).toBe("kq");
		expect(serializeFen(position)).toBe(
			"r3k2r/pppq1ppp/2npbn2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b kq - 4 8",
		);
	});

	it("creates initial position helper", () => {
		const position = createInitialPosition();
		expect(serializeFen(position)).toBe(STANDARD_INITIAL_FEN);
	});

	it("clones position deeply", () => {
		const original = parseFen(STANDARD_INITIAL_FEN);
		const copy = clonePosition(original);

		copy.board[6][4] = null;
		expect(original.board[6][4]).toBe("P");
	});
});

describe("chess/fen validation failures", () => {
	it("rejects non-string and empty FEN input", () => {
		expect(() => parseFen(null)).toThrow(/non-empty string/i);
		expect(() => parseFen("   ")).toThrow(/non-empty string/i);
	});

	it("rejects FEN with missing fields", () => {
		expect(() => parseFen("8/8/8/8/8/8/8/8 w - - 0")).toThrow(/6 fields/i);
	});

	it("rejects FEN with invalid rank count and invalid rank width", () => {
		expect(() => parseFen("8/8/8/8/8/8/8 w - - 0 1")).toThrow(/8 ranks/i);
		expect(() => parseFen("7/8/8/8/8/8/4k3/4K3 w - - 0 1")).toThrow(
			/exactly 8 squares/i,
		);
	});

	it("rejects unsupported piece symbol in placement", () => {
		expect(() => parseFen("4k3/8/8/8/8/8/8/3XK3 w - - 0 1")).toThrow(
			/unsupported piece/i,
		);
	});

	it("rejects FEN with invalid side to move", () => {
		const fen = "8/8/8/8/8/8/4k3/4K3 x - - 0 1";
		expect(() => parseFen(fen)).toThrow(/side to move/i);
	});

	it("rejects duplicate castling rights", () => {
		const fen = "8/8/8/8/8/8/4k3/4K3 w KK - 0 1";
		expect(() => parseFen(fen)).toThrow(/duplicate/i);
	});

	it("rejects unsupported castling symbol", () => {
		const fen = "8/8/8/8/8/8/4k3/4K3 w Aa - 0 1";
		expect(() => parseFen(fen)).toThrow(/castling field/i);
	});

	it("rejects invalid en passant square", () => {
		const fen = "8/8/8/8/8/8/4k3/4K3 w - e4 0 1";
		expect(() => parseFen(fen)).toThrow(/en passant/i);
	});

	it("rejects pawn on first or last rank", () => {
		const fen = "p3k3/8/8/8/8/8/8/4K3 w - - 0 1";
		expect(() => parseFen(fen)).toThrow(/pawns/i);
	});

	it("rejects positions without both kings", () => {
		const fen = "8/8/8/8/8/8/8/4K3 w - - 0 1";
		expect(() => parseFen(fen)).toThrow(/one white king and one black king/i);
	});

	it("rejects invalid clocks in FEN", () => {
		expect(() => parseFen("8/8/8/8/8/8/4k3/4K3 w - - -1 1")).toThrow(
			/halfmove/i,
		);
		expect(() => parseFen("8/8/8/8/8/8/4k3/4K3 w - - 0 0")).toThrow(
			/fullmove/i,
		);
	});

	it("isValidFen returns false for invalid FEN", () => {
		expect(isValidFen("invalid")).toBe(false);
	});

	it("isValidFen returns true for valid FEN", () => {
		expect(isValidFen(STANDARD_INITIAL_FEN)).toBe(true);
	});

	it("validates serializeFen input contracts", () => {
		const position = parseFen(STANDARD_INITIAL_FEN);

		expect(() => serializeFen(null)).toThrow(/Position object is required/);
		expect(() => serializeFen({ ...position, board: [] })).toThrow(/8x8 array/);
		expect(() => serializeFen({ ...position, sideToMove: "x" })).toThrow(
			/sideToMove/,
		);
		expect(() => serializeFen({ ...position, castling: "XX" })).toThrow(
			/castling field/,
		);
		expect(() => serializeFen({ ...position, enPassant: "e4" })).toThrow(
			/enPassant/,
		);
		expect(() => serializeFen({ ...position, halfmoveClock: -1 })).toThrow(
			/halfmoveClock/,
		);
		expect(() => serializeFen({ ...position, fullmoveNumber: 0 })).toThrow(
			/fullmoveNumber/,
		);
	});

	it("rejects unsupported symbol in serialize board payload", () => {
		const position = parseFen("8/8/8/8/8/8/4k3/4K3 w - - 0 1");
		const mutated = {
			...position,
			board: position.board.map((rank) => [...rank]),
		};
		mutated.board[6][0] = "x";

		expect(() => serializeFen(mutated)).toThrow(/unsupported piece symbol/);
	});

	it("serializes with default castling when castling is undefined", () => {
		const position = parseFen("8/8/8/8/8/8/4k3/4K3 w - - 0 1");
		const { castling, ...withoutCastling } = position;
		expect(castling).toBe("-");
		expect(serializeFen(withoutCastling)).toBe("8/8/8/8/8/8/4k3/4K3 w - - 0 1");
	});
});

describe("chess/fen square conversions", () => {
	it("converts square to coords", () => {
		expect(squareToCoords("a8")).toEqual({ row: 0, col: 0 });
		expect(squareToCoords("h1")).toEqual({ row: 7, col: 7 });
		expect(squareToCoords("e4")).toEqual({ row: 4, col: 4 });
	});

	it("converts coords to square", () => {
		expect(coordsToSquare(0, 0)).toBe("a8");
		expect(coordsToSquare(7, 7)).toBe("h1");
		expect(coordsToSquare(4, 4)).toBe("e4");
	});

	it("throws on invalid squares and coords", () => {
		expect(() => squareToCoords("i3")).toThrow(/Square/);
		expect(() => coordsToSquare(8, 0)).toThrow(/Coordinates/);
	});
});
