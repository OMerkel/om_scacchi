import { describe, expect, it } from "vitest";
import {
	pickNonRepetitionAlternative,
	REPETITION_AVOIDANCE_MAX_DROP,
	WINNING_SCORE_FOR_REPETITION_AVOIDANCE,
} from "../../../js/chess/ai/repetition_policy.js";

const createMove = (id) => ({ id });

const createDeps = ({ statusByPos, replyByPos }) => ({
	applyMove: (position, move) => ({
		id: `${position.id}->${move.id}`,
	}),
	getGameStatus: (position) => ({
		reason: statusByPos[position.id] ?? "in_progress",
	}),
	generateLegalMoves: () => [
		createMove("repeat"),
		createMove("winA"),
		createMove("winB"),
	],
	sameMove: (a, b) => a.id === b.id,
	searchBestMove: (position) =>
		replyByPos[position.id] ?? {
			score: 0,
			nodes: 0,
			searchedDepth: 1,
			pv: [],
		},
	moveToUci: (move) => move.id,
	tt: new Map(),
});

describe("repetition policy", () => {
	it("returns result unchanged when score is below winning threshold", () => {
		const position = { id: "root" };
		const lowScoreResult = {
			move: { id: "someMove" },
			moveUci: "someMove",
			score: WINNING_SCORE_FOR_REPETITION_AVOIDANCE - 1,
			nodes: 100,
			searchedDepth: 3,
			pv: ["someMove"],
		};
		const deps = createDeps({ statusByPos: {}, replyByPos: {} });
		const result = pickNonRepetitionAlternative({
			position,
			result: lowScoreResult,
			searchOptions: {},
			deps,
		});
		expect(result).toBe(lowScoreResult);
	});

	it("returns result unchanged when move is null", () => {
		const position = { id: "root" };
		const noMoveResult = {
			move: null,
			moveUci: null,
			score: WINNING_SCORE_FOR_REPETITION_AVOIDANCE + 100,
			nodes: 0,
			searchedDepth: 1,
			pv: [],
		};
		const deps = createDeps({ statusByPos: {}, replyByPos: {} });
		const result = pickNonRepetitionAlternative({
			position,
			result: noMoveResult,
			searchOptions: {},
			deps,
		});
		expect(result).toBe(noMoveResult);
	});

	it("returns result unchanged when best move is not a repetition", () => {
		const position = { id: "root" };
		const result = {
			move: createMove("winA"),
			moveUci: "winA",
			score: WINNING_SCORE_FOR_REPETITION_AVOIDANCE + 100,
			nodes: 500,
			searchedDepth: 4,
			pv: ["winA"],
		};
		const deps = createDeps({
			statusByPos: {
				"root->winA": "in_progress",
			},
			replyByPos: {},
		});
		const picked = pickNonRepetitionAlternative({
			position,
			result,
			searchOptions: {},
			deps,
		});
		expect(picked).toBe(result);
	});

	it("avoids threefold when already winning and alternatives are close", () => {
		const position = { id: "root" };
		const result = {
			move: createMove("repeat"),
			moveUci: "repeat",
			score: WINNING_SCORE_FOR_REPETITION_AVOIDANCE + 70,
			nodes: 1000,
			searchedDepth: 4,
			pv: ["repeat"],
		};
		const deps = createDeps({
			statusByPos: {
				"root->repeat": "threefold_repetition",
				"root->winA": "in_progress",
				"root->winB": "in_progress",
			},
			replyByPos: {
				"root->winA": { score: -150, nodes: 210, searchedDepth: 3, pv: ["x"] },
				"root->winB": { score: -100, nodes: 160, searchedDepth: 3, pv: ["y"] },
			},
		});

		const picked = pickNonRepetitionAlternative({
			position,
			result,
			searchOptions: {
				depth: 4,
				maxNodes: 500000,
				maxTimeMs: 900,
				softTimeMs: 870,
				hardTimeMs: 930,
			},
			deps,
		});

		expect(picked.moveUci).toBe("winA");
		expect(picked.avoidedThreefold).toBe(true);
		expect(picked.score).toBe(150);
	});

	it("keeps repetition move if alternatives drop too much", () => {
		const position = { id: "root" };
		const result = {
			move: createMove("repeat"),
			moveUci: "repeat",
			score: WINNING_SCORE_FOR_REPETITION_AVOIDANCE + 180,
			nodes: 900,
			searchedDepth: 4,
			pv: ["repeat"],
		};
		const deps = createDeps({
			statusByPos: {
				"root->repeat": "threefold_repetition",
				"root->winA": "in_progress",
			},
			replyByPos: {
				"root->winA": {
					score: -(result.score - REPETITION_AVOIDANCE_MAX_DROP - 1),
					nodes: 100,
					searchedDepth: 2,
					pv: ["x"],
				},
			},
		});

		const picked = pickNonRepetitionAlternative({
			position,
			result,
			searchOptions: {
				depth: 4,
				maxNodes: 500000,
				maxTimeMs: 900,
				softTimeMs: 870,
				hardTimeMs: 930,
			},
			deps,
		});

		expect(picked.moveUci).toBe("repeat");
		expect(picked.avoidedThreefold).toBeUndefined();
	});

	it("skips alternative moves that also result in threefold repetition", () => {
		const position = { id: "root" };
		const result = {
			move: createMove("repeat"),
			moveUci: "repeat",
			score: WINNING_SCORE_FOR_REPETITION_AVOIDANCE + 70,
			nodes: 500,
			searchedDepth: 4,
			pv: ["repeat"],
		};
		const deps = createDeps({
			statusByPos: {
				"root->repeat": "threefold_repetition",
				"root->winA": "threefold_repetition",
				"root->winB": "in_progress",
			},
			replyByPos: {
				"root->winB": { score: -120, nodes: 150, searchedDepth: 3, pv: ["z"] },
			},
		});

		const picked = pickNonRepetitionAlternative({
			position,
			result,
			searchOptions: { depth: 4, maxNodes: 500000 },
			deps,
		});

		expect(picked.moveUci).toBe("winB");
		expect(picked.avoidedThreefold).toBe(true);
	});
});
