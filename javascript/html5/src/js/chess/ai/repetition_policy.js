// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

export const WINNING_SCORE_FOR_REPETITION_AVOIDANCE = 80;
export const REPETITION_AVOIDANCE_MAX_DROP = 180;

export const pickNonRepetitionAlternative = ({
	position,
	result,
	searchOptions,
	deps,
}) => {
	if (
		!result?.move ||
		(result.score ?? 0) < WINNING_SCORE_FOR_REPETITION_AVOIDANCE
	) {
		return result;
	}

	const repeatedPosition = deps.applyMove(position, result.move);
	const repeatedStatus = deps.getGameStatus(repeatedPosition);
	if (repeatedStatus.reason !== "threefold_repetition") return result;

	const legalMoves = deps
		.generateLegalMoves(position)
		.filter((move) => !deps.sameMove(move, result.move));

	let bestAlternative = null;
	for (const move of legalMoves) {
		const next = deps.applyMove(position, move);
		if (deps.getGameStatus(next).reason === "threefold_repetition") continue;

		const reply = deps.searchBestMove(next, {
			...searchOptions,
			depth: Math.max(1, (searchOptions.depth ?? 4) - 1),
			maxNodes: Math.max(
				30_000,
				Math.floor((searchOptions.maxNodes ?? 500_000) / 4),
			),
			maxTimeMs: Math.max(
				100,
				Math.floor((searchOptions.maxTimeMs ?? 900) * 0.45),
			),
			softTimeMs: Math.max(
				60,
				Math.floor((searchOptions.softTimeMs ?? 870) * 0.45),
			),
			hardTimeMs: Math.max(
				80,
				Math.floor((searchOptions.hardTimeMs ?? 930) * 0.45),
			),
			iterativeDeepening: true,
			tt: deps.tt,
		});

		const score = -(reply.score ?? 0);
		if (!bestAlternative || score > bestAlternative.score) {
			bestAlternative = {
				move,
				moveUci: deps.moveToUci(move),
				score,
				nodes: (result.nodes ?? 0) + (reply.nodes ?? 0),
				searchedDepth: Math.min(
					searchOptions.depth ?? 4,
					Math.max(1, (reply.searchedDepth ?? searchOptions.depth ?? 4) + 1),
				),
				pv: [deps.moveToUci(move), ...(reply.pv ?? [])],
				avoidedThreefold: true,
			};
		}
	}

	if (
		bestAlternative &&
		bestAlternative.score >= (result.score ?? 0) - REPETITION_AVOIDANCE_MAX_DROP
	) {
		return { ...result, ...bestAlternative };
	}

	return result;
};
