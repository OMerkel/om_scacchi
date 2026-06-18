import { describe, expect, it } from "vitest";
import {
	createInitialPosition,
	createPositionFromFen,
	getPieceAt,
	sideToMoveColor,
	toFen,
	withCounters,
	withPieceAt,
	withSideToMove,
} from "../../../js/chess/position.js";
import {
	BLACK,
	isColor,
	isPieceOfColor,
	oppositeColor,
	pieceColor,
	pieceType,
	WHITE,
} from "../../../js/chess/types.js";

describe("chess/types helpers", () => {
	it("resolves piece color and type", () => {
		expect(pieceColor("K")).toBe(WHITE);
		expect(pieceColor("q")).toBe(BLACK);
		expect(pieceType("K")).toBe("k");
		expect(pieceType("p")).toBe("p");
		expect(pieceType("x")).toBeNull();
	});

	it("detects piece ownership by color", () => {
		expect(isPieceOfColor("N", WHITE)).toBe(true);
		expect(isPieceOfColor("N", BLACK)).toBe(false);
		expect(isPieceOfColor("n", BLACK)).toBe(true);
	});

	it("validates colors and opposite color", () => {
		expect(isColor(WHITE)).toBe(true);
		expect(isColor(BLACK)).toBe(true);
		expect(isColor("x")).toBe(false);
		expect(oppositeColor(WHITE)).toBe(BLACK);
		expect(oppositeColor(BLACK)).toBe(WHITE);
	});

	it("returns null for invalid piece tokens and throws on invalid opposite color input", () => {
		expect(pieceColor("")).toBeNull();
		expect(pieceColor("12")).toBeNull();
		expect(pieceColor("?")).toBeNull();
		expect(pieceType("")).toBeNull();
		expect(pieceType("12")).toBeNull();
		expect(isPieceOfColor("N", "x")).toBe(false);
		expect(() => oppositeColor("x")).toThrow(/must be 'w' or 'b'/);
	});
});

describe("chess/position immutable operations", () => {
	it("creates initial position and serializes to standard FEN", () => {
		const position = createInitialPosition();
		expect(toFen(position)).toBe(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
	});

	it("reads a piece by board coordinates", () => {
		const position = createInitialPosition();
		expect(getPieceAt(position, 7, 4)).toBe("K");
		expect(getPieceAt(position, 0, 4)).toBe("k");
	});

	it("returns a new position when setting a piece", () => {
		const position = createInitialPosition();
		const next = withPieceAt(position, 6, 4, null);

		expect(getPieceAt(position, 6, 4)).toBe("P");
		expect(getPieceAt(next, 6, 4)).toBeNull();
	});

	it("returns a new position when changing side to move", () => {
		const position = createInitialPosition();
		const next = withSideToMove(position, BLACK);

		expect(sideToMoveColor(position)).toBe(WHITE);
		expect(sideToMoveColor(next)).toBe(BLACK);
	});

	it("returns a new position when updating counters", () => {
		const position = createInitialPosition();
		const next = withCounters(position, 7, 14);

		expect(position.halfmoveClock).toBe(0);
		expect(position.fullmoveNumber).toBe(1);
		expect(next.halfmoveClock).toBe(7);
		expect(next.fullmoveNumber).toBe(14);
	});

	it("keeps metadata arrays immutable across updates", () => {
		const position = createPositionFromFen("8/8/8/8/8/8/4k3/4K3 w - - 0 1");
		position.repetitionKeys = ["a", "b"];

		const next = withSideToMove(position, BLACK);
		next.repetitionKeys.push("c");

		expect(position.repetitionKeys).toEqual(["a", "b"]);
		expect(next.repetitionKeys).toEqual(["a", "b", "c"]);
	});

	it("validates position updates with error paths", () => {
		const position = createInitialPosition();

		expect(() => getPieceAt(position, -1, 0)).toThrow(/range/);
		expect(() => withPieceAt(position, 0, 0, "NN")).toThrow(
			/one-character piece symbol/,
		);
		expect(() => withSideToMove(position, "x")).toThrow(/must be 'w' or 'b'/);
		expect(() => withCounters(position, -1, 1)).toThrow(/non-negative integer/);
		expect(() => withCounters(position, 0, 0)).toThrow(/positive integer/);
		expect(() => sideToMoveColor({ ...position, sideToMove: "x" })).toThrow(
			/must be 'w' or 'b'/,
		);
	});

	it("normalizes missing metadata when writing position updates", () => {
		const base = createPositionFromFen("8/8/8/8/8/8/4k3/4K3 w - - 0 1");
		const noMeta = { ...base };
		delete noMeta.zobristKey;
		delete noMeta.repetitionKeys;

		const next = withPieceAt(noMeta, 7, 4, null);
		expect(next.zobristKey).toBe("");
		expect(next.repetitionKeys).toEqual([]);
	});
});
