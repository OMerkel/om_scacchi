// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { generateLegalMoves } from "./move_generator.js";
import { isKingInCheck, repetitionKey } from "./rules.js";
import { pieceType } from "./types.js";

const allPieces = (position) =>
	position.board.flat().filter((piece) => piece !== null);

export const isInsufficientMaterial = (position) => {
	const pieces = allPieces(position);
	const nonKings = pieces.filter((piece) => pieceType(piece) !== "k");

	if (nonKings.length === 0) return true;

	if (nonKings.length === 1) {
		const onlyType = pieceType(nonKings[0]);
		return onlyType === "b" || onlyType === "n";
	}

	if (nonKings.length === 2) {
		const [a, b] = nonKings.map(pieceType);
		if (a === "b" && b === "b") return true;
	}

	return false;
};

export const isThreefoldRepetition = (position) => {
	const keys = Array.isArray(position.repetitionKeys)
		? position.repetitionKeys
		: [];
	if (keys.length === 0) return false;

	const current = repetitionKey(position);
	let occurrences = 1;
	for (const key of keys) {
		if (key === current) occurrences += 1;
	}
	return occurrences >= 3;
};

export const isFiftyMoveRuleDraw = (position) => position.halfmoveClock >= 100;

export const getGameStatus = (position) => {
	if (isFiftyMoveRuleDraw(position))
		return { terminal: true, reason: "fifty_move", winner: null };
	if (isThreefoldRepetition(position))
		return { terminal: true, reason: "threefold_repetition", winner: null };
	if (isInsufficientMaterial(position))
		return { terminal: true, reason: "insufficient_material", winner: null };

	const legalMoves = generateLegalMoves(position);
	if (legalMoves.length > 0) {
		return { terminal: false, reason: "in_progress", winner: null };
	}

	if (isKingInCheck(position, position.sideToMove)) {
		return {
			terminal: true,
			reason: "checkmate",
			winner: position.sideToMove === "w" ? "b" : "w",
		};
	}

	return { terminal: true, reason: "stalemate", winner: null };
};
