// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { clonePosition, INITIAL_FEN, parseFen, serializeFen } from "./fen.js";
import { BLACK, isColor, WHITE } from "./types.js";

const assertInBounds = (row, col) => {
	if (
		!Number.isInteger(row) ||
		!Number.isInteger(col) ||
		row < 0 ||
		row > 7 ||
		col < 0 ||
		col > 7
	) {
		throw new Error("Board coordinates must be integers in range 0..7");
	}
};

const normalizeMeta = (position) => ({
	zobristKey:
		typeof position.zobristKey === "string" ? position.zobristKey : "",
	repetitionKeys: Array.isArray(position.repetitionKeys)
		? [...position.repetitionKeys]
		: [],
});

export const createPositionFromFen = (fen = INITIAL_FEN) => {
	const parsed = parseFen(fen);
	return {
		...parsed,
		...normalizeMeta(parsed),
	};
};

export const createInitialPosition = () => createPositionFromFen(INITIAL_FEN);

export const toFen = (position) => serializeFen(position);

export const getPieceAt = (position, row, col) => {
	assertInBounds(row, col);
	return position.board[row][col];
};

export const withPieceAt = (position, row, col, piece) => {
	assertInBounds(row, col);
	if (piece !== null && (typeof piece !== "string" || piece.length !== 1)) {
		throw new Error("Piece must be null or one-character piece symbol");
	}

	const next = clonePosition(position);
	next.board[row][col] = piece;
	return {
		...next,
		...normalizeMeta(next),
	};
};

export const withSideToMove = (position, sideToMove) => {
	if (!isColor(sideToMove)) {
		throw new Error("sideToMove must be 'w' or 'b'");
	}
	return {
		...clonePosition(position),
		sideToMove,
		...normalizeMeta(position),
	};
};

export const withCounters = (position, halfmoveClock, fullmoveNumber) => {
	if (!Number.isInteger(halfmoveClock) || halfmoveClock < 0) {
		throw new Error("halfmoveClock must be a non-negative integer");
	}
	if (!Number.isInteger(fullmoveNumber) || fullmoveNumber <= 0) {
		throw new Error("fullmoveNumber must be a positive integer");
	}

	return {
		...clonePosition(position),
		halfmoveClock,
		fullmoveNumber,
		...normalizeMeta(position),
	};
};

export const sideToMoveColor = (position) => {
	if (position.sideToMove === WHITE) return WHITE;
	if (position.sideToMove === BLACK) return BLACK;
	throw new Error("Position sideToMove must be 'w' or 'b'");
};
