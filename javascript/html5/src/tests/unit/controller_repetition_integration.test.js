import { beforeEach, describe, expect, it, vi } from "vitest";

const repeatMove = {
	uci: "repeat",
	from: { row: 0, col: 0 },
	to: { row: 0, col: 1 },
	flags: {},
};

const altMove = {
	uci: "alt",
	from: { row: 0, col: 2 },
	to: { row: 0, col: 3 },
	flags: {},
};

const clonePosition = (position, move) => ({
	...position,
	id: `${position.id}:${move.uci}`,
	sideToMove: position.sideToMove === "w" ? "b" : "w",
});

describe("controller repetition integration", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("avoids immediate threefold in winning line during chess_action_by_ai", async () => {
		const postMessage = vi.fn();
		let listener = null;

		globalThis.self = {
			postMessage,
			addEventListener: (event, cb) => {
				if (event === "message") listener = cb;
			},
		};

		globalThis.fetch = vi.fn(async () => ({ ok: false }));

		const searchBestMove = vi.fn((position) => {
			if (position.id === "root") {
				return {
					move: repeatMove,
					moveUci: "repeat",
					score: 260,
					nodes: 1000,
					searchedDepth: 4,
					pv: ["repeat"],
				};
			}
			if (position.id === "root:alt") {
				return {
					move: null,
					moveUci: null,
					score: -170,
					nodes: 220,
					searchedDepth: 3,
					pv: ["quiet_reply"],
				};
			}
			return {
				move: null,
				moveUci: null,
				score: 0,
				nodes: 0,
				searchedDepth: 1,
				pv: [],
			};
		});

		vi.doMock("../../js/chess/ai/negamax_search.js", () => ({
			searchBestMove,
		}));

		vi.doMock("../../js/chess/fen.js", () => ({
			serializeFen: (position) => position.id,
		}));

		vi.doMock("../../js/chess/game.js", () => ({
			getGameStatus: (position) => {
				if (position.id.endsWith(":repeat")) {
					return {
						terminal: true,
						reason: "threefold_repetition",
						winner: null,
					};
				}
				return {
					terminal: false,
					reason: "in_progress",
					winner: null,
				};
			},
		}));

		vi.doMock("../../js/chess/move_generator.js", () => ({
			generateLegalMoves: () => [repeatMove, altMove],
			moveToUci: (move) => move.uci,
		}));

		vi.doMock("../../js/chess/position.js", () => ({
			createInitialPosition: () => ({ id: "root", sideToMove: "w" }),
			createPositionFromFen: () => ({ id: "root", sideToMove: "w" }),
			toFen: (position) => position.id,
		}));

		vi.doMock("../../js/chess/rules.js", () => ({
			applyMove: (position, move) => clonePosition(position, move),
			isKingInCheck: () => false,
		}));

		vi.doMock("../../js/chess/ai/time_manager.js", () => ({
			computeTimeLimits: (_pos, baseTimeMs, overheadMs = 30) => ({
				softTimeMs: Math.max(20, baseTimeMs - overheadMs),
				hardTimeMs: Math.max(30, baseTimeMs + overheadMs),
				factor: 1.0,
			}),
		}));

		vi.doMock("../../js/chess/transposition_table.js", () => ({
			createTranspositionTable: () => ({
				clear: vi.fn(),
			}),
		}));

		await import("../../js/controller.js");

		expect(listener).toBeTypeOf("function");

		await listener({
			data: {
				request: "chess_action_by_ai",
				settings: {
					playersouth: "AI",
					playernorth: "Human",
					difficultysouth: "Hard",
					difficultynorth: "Medium",
				},
			},
		});

		const redrawEvent = postMessage.mock.calls.find(
			([payload]) => payload.request === "chess_redraw",
		);
		expect(redrawEvent).toBeTruthy();

		const [{ latestMoveUci, engineInfo }] = redrawEvent;
		expect(latestMoveUci).toBe("alt");
		expect(engineInfo.avoidedThreefold).toBe(true);
		expect(engineInfo.pvStartFen).toBe("root");
		expect(engineInfo.pv).toEqual(["alt", "quiet_reply"]);
		expect(searchBestMove).toHaveBeenCalled();
		expect(searchBestMove.mock.calls.length).toBeGreaterThanOrEqual(2);
	});
});
