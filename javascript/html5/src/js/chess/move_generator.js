// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { coordsToSquare, squareToCoords } from "./fen.js";
import {
	applyMove,
	hasRequiredCastleRook,
	isCastlePathSafe,
	isKingInCheck,
} from "./rules.js";
import {
	BLACK,
	oppositeColor,
	PIECE_TYPES,
	pieceColor,
	pieceType,
	WHITE,
} from "./types.js";

const inBounds = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;

const isEmpty = (board, row, col) => board[row][col] === null;

const isEnemy = (board, row, col, side) => {
	const piece = board[row][col];
	return piece !== null && pieceColor(piece) === oppositeColor(side);
};

const pushStep = (moves, board, from, row, col, side) => {
	if (!inBounds(row, col)) return;
	if (isEmpty(board, row, col)) {
		moves.push({ from, to: { row, col }, flags: { capture: false } });
		return;
	}
	if (isEnemy(board, row, col, side)) {
		moves.push({ from, to: { row, col }, flags: { capture: true } });
	}
};

const pushSliding = (moves, board, from, deltas, side) => {
	for (const [dr, dc] of deltas) {
		let row = from.row + dr;
		let col = from.col + dc;

		while (inBounds(row, col)) {
			if (isEmpty(board, row, col)) {
				moves.push({ from, to: { row, col }, flags: { capture: false } });
			} else {
				if (isEnemy(board, row, col, side)) {
					moves.push({ from, to: { row, col }, flags: { capture: true } });
				}
				break;
			}
			row += dr;
			col += dc;
		}
	}
};

const generatePawnMoves = (position, from, side, moves) => {
	const { board, enPassant } = position;
	const direction = side === WHITE ? -1 : 1;
	const startRank = side === WHITE ? 6 : 1;
	const promotionRank = side === WHITE ? 0 : 7;
	const nextRow = from.row + direction;

	if (inBounds(nextRow, from.col) && isEmpty(board, nextRow, from.col)) {
		if (nextRow === promotionRank) {
			for (const promoteTo of ["q", "r", "b", "n"]) {
				moves.push({
					from,
					to: { row: nextRow, col: from.col },
					flags: { capture: false, promotion: promoteTo },
				});
			}
		} else {
			moves.push({
				from,
				to: { row: nextRow, col: from.col },
				flags: { capture: false },
			});
			const doubleRow = from.row + 2 * direction;
			if (from.row === startRank && isEmpty(board, doubleRow, from.col)) {
				moves.push({
					from,
					to: { row: doubleRow, col: from.col },
					flags: { capture: false, doublePawnPush: true },
				});
			}
		}
	}

	for (const dc of [-1, 1]) {
		const captureRow = from.row + direction;
		const captureCol = from.col + dc;
		if (!inBounds(captureRow, captureCol)) continue;

		if (isEnemy(board, captureRow, captureCol, side)) {
			if (captureRow === promotionRank) {
				for (const promoteTo of ["q", "r", "b", "n"]) {
					moves.push({
						from,
						to: { row: captureRow, col: captureCol },
						flags: { capture: true, promotion: promoteTo },
					});
				}
			} else {
				moves.push({
					from,
					to: { row: captureRow, col: captureCol },
					flags: { capture: true },
				});
			}
		}
	}

	if (enPassant !== "-") {
		const enPassantTarget = squareToCoords(enPassant);
		if (
			enPassantTarget.row === from.row + direction &&
			Math.abs(enPassantTarget.col - from.col) === 1
		) {
			moves.push({
				from,
				to: enPassantTarget,
				flags: { capture: true, enPassant: true },
			});
		}
	}
};

const generateKingCastling = (position, from, side, moves) => {
	const king = side === WHITE ? "K" : "k";
	if (position.board[from.row][from.col] !== king) return;

	const rights = position.castling;
	if (rights === "-") return;

	if (side === WHITE && from.row === 7 && from.col === 4) {
		if (
			rights.includes("K") &&
			position.board[7][7] === "R" &&
			position.board[7][5] === null &&
			position.board[7][6] === null
		) {
			moves.push({
				from,
				to: { row: 7, col: 6 },
				flags: { capture: false, castle: "K" },
			});
		}
		if (
			rights.includes("Q") &&
			position.board[7][0] === "R" &&
			position.board[7][1] === null &&
			position.board[7][2] === null &&
			position.board[7][3] === null
		) {
			moves.push({
				from,
				to: { row: 7, col: 2 },
				flags: { capture: false, castle: "Q" },
			});
		}
	}

	if (side === BLACK && from.row === 0 && from.col === 4) {
		if (
			rights.includes("k") &&
			position.board[0][7] === "r" &&
			position.board[0][5] === null &&
			position.board[0][6] === null
		) {
			moves.push({
				from,
				to: { row: 0, col: 6 },
				flags: { capture: false, castle: "k" },
			});
		}
		if (
			rights.includes("q") &&
			position.board[0][0] === "r" &&
			position.board[0][1] === null &&
			position.board[0][2] === null &&
			position.board[0][3] === null
		) {
			moves.push({
				from,
				to: { row: 0, col: 2 },
				flags: { capture: false, castle: "q" },
			});
		}
	}
};

const pseudoMovesForPiece = (position, from) => {
	const piece = position.board[from.row][from.col];
	if (piece === null) return [];

	const side = pieceColor(piece);
	if (side !== position.sideToMove) return [];

	const type = pieceType(piece);
	const moves = [];

	if (type === PIECE_TYPES.PAWN) {
		generatePawnMoves(position, from, side, moves);
		return moves;
	}

	if (type === PIECE_TYPES.KNIGHT) {
		for (const [dr, dc] of [
			[-2, -1],
			[-2, 1],
			[-1, -2],
			[-1, 2],
			[1, -2],
			[1, 2],
			[2, -1],
			[2, 1],
		]) {
			pushStep(moves, position.board, from, from.row + dr, from.col + dc, side);
		}
		return moves;
	}

	if (type === PIECE_TYPES.BISHOP) {
		pushSliding(
			moves,
			position.board,
			from,
			[
				[-1, -1],
				[-1, 1],
				[1, -1],
				[1, 1],
			],
			side,
		);
		return moves;
	}

	if (type === PIECE_TYPES.ROOK) {
		pushSliding(
			moves,
			position.board,
			from,
			[
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1],
			],
			side,
		);
		return moves;
	}

	if (type === PIECE_TYPES.QUEEN) {
		pushSliding(
			moves,
			position.board,
			from,
			[
				[-1, -1],
				[-1, 1],
				[1, -1],
				[1, 1],
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1],
			],
			side,
		);
		return moves;
	}

	if (type === PIECE_TYPES.KING) {
		for (const [dr, dc] of [
			[-1, -1],
			[-1, 0],
			[-1, 1],
			[0, -1],
			[0, 1],
			[1, -1],
			[1, 0],
			[1, 1],
		]) {
			pushStep(moves, position.board, from, from.row + dr, from.col + dc, side);
		}
		generateKingCastling(position, from, side, moves);
		return moves;
	}

	return [];
};

export const generatePseudoLegalMoves = (position) => {
	const moves = [];
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			moves.push(...pseudoMovesForPiece(position, { row, col }));
		}
	}
	return moves;
};

// Current implementation returns pseudo-legal moves.
// A later phase will remove moves that leave own king in check.
export const generateLegalMoves = (position) => {
	const side = position.sideToMove;
	const pseudoMoves = generatePseudoLegalMoves(position);

	return pseudoMoves.filter((move) => {
		if (!hasRequiredCastleRook(position, move)) return false;
		if (!isCastlePathSafe(position, move)) return false;

		const next = applyMove(position, move);
		return !isKingInCheck(next, side);
	});
};

export const moveToUci = (move) => {
	const from = coordsToSquare(move.from.row, move.from.col);
	const to = coordsToSquare(move.to.row, move.to.col);
	return move.flags?.promotion
		? `${from}${to}${move.flags.promotion}`
		: `${from}${to}`;
};
