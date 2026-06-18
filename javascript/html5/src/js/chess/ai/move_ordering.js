// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { generatePseudoLegalMoves, moveToUci } from "../move_generator.js";
import { applyMove, isKingInCheck } from "../rules.js";
import { pieceType } from "../types.js";

const PIECE_VALUE = Object.freeze({
	p: 100,
	n: 320,
	b: 330,
	r: 500,
	q: 900,
	k: 20000,
});

const pieceValue = (piece) => {
	const type = pieceType(piece);
	return type ? PIECE_VALUE[type] : 0;
};

const capturedPieceAtMove = (position, move) => {
	if (move.flags?.enPassant) {
		const row = position.sideToMove === "w" ? move.to.row + 1 : move.to.row - 1;
		return position.board[row][move.to.col];
	}
	return position.board[move.to.row][move.to.col];
};

const leastValuableRecapture = (positionAfterMove, targetSquare) => {
	const opponentMoves = generatePseudoLegalMoves(positionAfterMove);
	const recaptures = opponentMoves.filter(
		(candidate) =>
			candidate.flags?.capture &&
			candidate.to.row === targetSquare.row &&
			candidate.to.col === targetSquare.col,
	);

	if (recaptures.length === 0) return 0;

	let least = Number.POSITIVE_INFINITY;
	for (const move of recaptures) {
		const attacker = positionAfterMove.board[move.from.row][move.from.col];
		const value = pieceValue(attacker);
		if (value < least) least = value;
	}
	return least;
};

export const scoreMvvLva = (position, move) => {
	if (!move.flags?.capture) return 0;

	const attacker = position.board[move.from.row][move.from.col];
	const victim = capturedPieceAtMove(position, move);
	return pieceValue(victim) * 16 - pieceValue(attacker);
};

export const staticExchangeEvaluation = (position, move) => {
	if (!move.flags?.capture) return 0;

	const attacker = position.board[move.from.row][move.from.col];
	const victim = capturedPieceAtMove(position, move);
	let score = pieceValue(victim) - pieceValue(attacker);

	if (move.flags?.promotion) {
		const promotedType = move.flags.promotion;
		score += (PIECE_VALUE[promotedType] ?? 0) - PIECE_VALUE.p;
	}

	const next = applyMove(position, move);
	score -= leastValuableRecapture(next, move.to);
	return score;
};

const scoreQuiescenceMove = (position, move, options = {}) => {
	const { ttMoveUci = null } = options;
	const uci = moveToUci(move);

	let score = 0;

	if (ttMoveUci && uci === ttMoveUci) score += 10_000_000;

	if (move.flags?.capture) {
		const see = staticExchangeEvaluation(position, move);
		score += 1_000_000 + see * 64 + scoreMvvLva(position, move);
	}

	if (move.flags?.promotion) {
		score += 500_000 + (PIECE_VALUE[move.flags.promotion] ?? 0);
	}

	const next = applyMove(position, move);
	if (isKingInCheck(next, next.sideToMove)) {
		// Moderate check bonus: prioritize forcing moves without dominating ordering.
		const movingPiece = position.board[move.from.row][move.from.col];
		const movingType = pieceType(movingPiece);
		const checkBonus =
			movingType === "q" || movingType === "r" ? 120_000 : 60_000;
		score += checkBonus;
	}

	return score;
};

export const orderQuiescenceMoves = (position, moves, options = {}) =>
	moves
		.map((move, index) => ({
			move,
			index,
			score: scoreQuiescenceMove(position, move, options),
		}))
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.index - b.index;
		})
		.map((entry) => entry.move);
