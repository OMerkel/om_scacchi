import { describe, expect, it } from "vitest";
import { parseFen } from "../../../js/chess/fen.js";
import {
	getGameStatus,
	isFiftyMoveRuleDraw,
	isInsufficientMaterial,
	isThreefoldRepetition,
} from "../../../js/chess/game.js";
import { repetitionKey } from "../../../js/chess/rules.js";

describe("chess/game insufficient material", () => {
	it("detects king vs king", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		expect(isInsufficientMaterial(position)).toBe(true);
	});

	it("detects king+bishop vs king", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/3BK3 w - - 0 1");
		expect(isInsufficientMaterial(position)).toBe(true);
	});

	it("does not mark rook endgames as insufficient", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/3RK3 w - - 0 1");
		expect(isInsufficientMaterial(position)).toBe(false);
	});

	it("detects king+knight vs king as insufficient", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/3NK3 w - - 0 1");
		expect(isInsufficientMaterial(position)).toBe(true);
	});

	it("detects bishop vs bishop as insufficient material", () => {
		const position = parseFen("4k3/8/8/8/8/8/6b1/3BK3 w - - 0 1");
		expect(isInsufficientMaterial(position)).toBe(true);
	});

	it("does not mark bishop plus knight as insufficient", () => {
		const position = parseFen("4k3/8/8/8/8/8/6n1/3BK3 w - - 0 1");
		expect(isInsufficientMaterial(position)).toBe(false);
	});
});

describe("chess/game draw detectors", () => {
	it("detects fifty move rule", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 100 1");
		expect(isFiftyMoveRuleDraw(position)).toBe(true);
	});

	it("detects threefold repetition from repetition keys", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		const key = repetitionKey(position);
		position.repetitionKeys = [key, key];

		expect(isThreefoldRepetition(position)).toBe(true);
	});

	it("returns false for threefold when no keys are present", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		expect(isThreefoldRepetition(position)).toBe(false);
	});
});

describe("chess/game terminal status", () => {
	it("detects checkmate", () => {
		const position = parseFen("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
		expect(getGameStatus(position)).toEqual({
			terminal: true,
			reason: "checkmate",
			winner: "w",
		});
	});

	it("detects checkmate for white-to-move with black as winner", () => {
		const position = parseFen("8/8/8/8/8/6k1/6q1/7K w - - 0 1");
		expect(getGameStatus(position)).toEqual({
			terminal: true,
			reason: "checkmate",
			winner: "b",
		});
	});

	it("detects stalemate", () => {
		const position = parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
		expect(getGameStatus(position)).toEqual({
			terminal: true,
			reason: "stalemate",
			winner: null,
		});
	});

	it("reports in-progress state when legal moves exist", () => {
		const position = parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
		expect(getGameStatus(position)).toEqual({
			terminal: false,
			reason: "in_progress",
			winner: null,
		});
	});

	it("prioritizes fifty-move rule over other terminal checks", () => {
		const position = parseFen("7k/6Q1/6K1/8/8/8/8/8 b - - 100 1");
		expect(getGameStatus(position)).toEqual({
			terminal: true,
			reason: "fifty_move",
			winner: null,
		});
	});

	it("returns threefold repetition reason when repetition is reached", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
		const key = repetitionKey(position);
		position.repetitionKeys = [key, key];

		expect(getGameStatus(position)).toEqual({
			terminal: true,
			reason: "threefold_repetition",
			winner: null,
		});
	});

	it("returns insufficient material reason when applicable", () => {
		const position = parseFen("4k3/8/8/8/8/8/8/3BK3 w - - 0 1");
		expect(getGameStatus(position)).toEqual({
			terminal: true,
			reason: "insufficient_material",
			winner: null,
		});
	});
});
