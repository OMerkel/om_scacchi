import { beforeEach, describe, expect, it, vi } from "vitest";

describe("controller sync", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("applies settings immediately and emits AI turn when side to move is AI", async () => {
		const postMessage = vi.fn();
		let listener = null;

		globalThis.self = {
			postMessage,
			addEventListener: (event, cb) => {
				if (event === "message") listener = cb;
			},
		};

		globalThis.fetch = vi.fn(async () => ({ ok: false }));

		vi.doMock("../../js/chess/ai/negamax_search.js", () => ({
			searchBestMove: vi.fn(),
		}));
		vi.doMock("../../js/chess/ai/repetition_policy.js", () => ({
			pickNonRepetitionAlternative: vi.fn((x) => x.result),
		}));
		vi.doMock("../../js/chess/ai/time_manager.js", () => ({
			computeTimeLimits: vi.fn(() => ({ softTimeMs: 100, hardTimeMs: 200 })),
		}));
		vi.doMock("../../js/chess/fen.js", () => ({
			serializeFen: vi.fn(() => "root"),
		}));
		vi.doMock("../../js/chess/game.js", () => ({
			getGameStatus: vi.fn(() => ({ terminal: false })),
		}));
		vi.doMock("../../js/chess/move_generator.js", () => ({
			generateLegalMoves: vi.fn(() => [
				{ from: { row: 6, col: 4 }, to: { row: 4, col: 4 }, flags: {} },
			]),
			moveToUci: vi.fn(() => "e2e4"),
		}));
		vi.doMock("../../js/chess/position.js", () => ({
			createInitialPosition: vi.fn(() => ({ sideToMove: "w" })),
			createPositionFromFen: vi.fn(() => ({ sideToMove: "w" })),
			toFen: vi.fn(() => "root"),
		}));
		vi.doMock("../../js/chess/rules.js", () => ({
			applyMove: vi.fn((position) => position),
		}));
		vi.doMock("../../js/chess/transposition_table.js", () => ({
			createTranspositionTable: vi.fn(() => ({ clear: vi.fn() })),
		}));

		await import("../../js/controller.js");
		expect(listener).toBeTypeOf("function");

		await listener({
			data: {
				request: "sync",
				settings: {
					playersouth: "AI",
					playernorth: "Human",
				},
			},
		});

		expect(
			postMessage.mock.calls.some(
				([payload]) => payload.request === "chess_ai_to_move",
			),
		).toBe(true);
	});

	it("emits human turn when active side is Human after sync", async () => {
		const postMessage = vi.fn();
		let listener = null;

		globalThis.self = {
			postMessage,
			addEventListener: (event, cb) => {
				if (event === "message") listener = cb;
			},
		};

		globalThis.fetch = vi.fn(async () => ({ ok: false }));

		const legalMoves = [
			{ from: { row: 6, col: 4 }, to: { row: 4, col: 4 }, flags: {} },
		];

		vi.doMock("../../js/chess/ai/negamax_search.js", () => ({
			searchBestMove: vi.fn(),
		}));
		vi.doMock("../../js/chess/ai/repetition_policy.js", () => ({
			pickNonRepetitionAlternative: vi.fn((x) => x.result),
		}));
		vi.doMock("../../js/chess/ai/time_manager.js", () => ({
			computeTimeLimits: vi.fn(() => ({ softTimeMs: 100, hardTimeMs: 200 })),
		}));
		vi.doMock("../../js/chess/fen.js", () => ({
			serializeFen: vi.fn(() => "root"),
		}));
		vi.doMock("../../js/chess/game.js", () => ({
			getGameStatus: vi.fn(() => ({ terminal: false })),
		}));
		vi.doMock("../../js/chess/move_generator.js", () => ({
			generateLegalMoves: vi.fn(() => legalMoves),
			moveToUci: vi.fn(() => "e2e4"),
		}));
		vi.doMock("../../js/chess/position.js", () => ({
			createInitialPosition: vi.fn(() => ({ sideToMove: "w" })),
			createPositionFromFen: vi.fn(() => ({ sideToMove: "w" })),
			toFen: vi.fn(() => "root"),
		}));
		vi.doMock("../../js/chess/rules.js", () => ({
			applyMove: vi.fn((position) => position),
		}));
		vi.doMock("../../js/chess/transposition_table.js", () => ({
			createTranspositionTable: vi.fn(() => ({ clear: vi.fn() })),
		}));

		await import("../../js/controller.js");
		expect(listener).toBeTypeOf("function");

		await listener({
			data: {
				request: "sync",
				settings: {
					playersouth: "Human",
					playernorth: "AI",
				},
			},
		});

		const humanMessage = postMessage.mock.calls.find(
			([payload]) => payload.request === "chess_human_to_move",
		);
		expect(humanMessage).toBeTruthy();
		expect(humanMessage[0].legalMoves).toEqual(legalMoves);
	});
});
