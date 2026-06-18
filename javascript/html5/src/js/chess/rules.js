// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { cloneBoard } from "./board.js";
import { coordsToSquare } from "./fen.js";
import { BLACK, oppositeColor, pieceColor, pieceType, WHITE } from "./types.js";

const ROOK_DIRS = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
];
const BISHOP_DIRS = [
	[-1, -1],
	[-1, 1],
	[1, -1],
	[1, 1],
];
const KNIGHT_STEPS = [
	[-2, -1],
	[-2, 1],
	[-1, -2],
	[-1, 2],
	[1, -2],
	[1, 2],
	[2, -1],
	[2, 1],
];

const inBounds = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;

const normalizedCastling = (rights) => {
	const ordered = ["K", "Q", "k", "q"].filter((token) =>
		rights.includes(token),
	);
	return ordered.join("") || "-";
};

const dropCastlingRight = (rights, token) => {
	if (rights === "-") return "-";
	return normalizedCastling(rights.replace(token, ""));
};

const kingPiece = (side) => (side === WHITE ? "K" : "k");
const rookPiece = (side) => (side === WHITE ? "R" : "r");

export const repetitionKey = (position) => {
	const placement = position.board
		.map((rank) => {
			let run = 0;
			let out = "";
			for (const square of rank) {
				if (square === null) {
					run += 1;
				} else {
					if (run > 0) {
						out += String(run);
						run = 0;
					}
					out += square;
				}
			}
			if (run > 0) out += String(run);
			return out;
		})
		.join("/");

	return `${placement} ${position.sideToMove} ${position.castling} ${position.enPassant}`;
};

export const findKing = (position, side) => {
	const target = kingPiece(side);
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			if (position.board[row][col] === target) return { row, col };
		}
	}
	return null;
};

const attackedByPawn = (board, row, col, bySide) => {
	const dir = bySide === WHITE ? 1 : -1;
	const sourceRow = row + dir;
	if (!inBounds(sourceRow, col)) return false;

	for (const dc of [-1, 1]) {
		const sourceCol = col + dc;
		if (!inBounds(sourceRow, sourceCol)) continue;
		const piece = board[sourceRow][sourceCol];
		if (piece === (bySide === WHITE ? "P" : "p")) return true;
	}
	return false;
};

const attackedByKnight = (board, row, col, bySide) => {
	const target = bySide === WHITE ? "N" : "n";
	return KNIGHT_STEPS.some(([dr, dc]) => {
		const r = row + dr;
		const c = col + dc;
		return inBounds(r, c) && board[r][c] === target;
	});
};

const attackedByKing = (board, row, col, bySide) => {
	const target = bySide === WHITE ? "K" : "k";
	for (let dr = -1; dr <= 1; dr += 1) {
		for (let dc = -1; dc <= 1; dc += 1) {
			if (dr === 0 && dc === 0) continue;
			const r = row + dr;
			const c = col + dc;
			if (inBounds(r, c) && board[r][c] === target) return true;
		}
	}
	return false;
};

const attackedBySliding = (board, row, col, bySide, dirs, pieceChars) => {
	for (const [dr, dc] of dirs) {
		let r = row + dr;
		let c = col + dc;
		while (inBounds(r, c)) {
			const piece = board[r][c];
			if (piece !== null) {
				if (
					pieceColor(piece) === bySide &&
					pieceChars.includes(pieceType(piece))
				)
					return true;
				break;
			}
			r += dr;
			c += dc;
		}
	}
	return false;
};

export const isSquareAttacked = (position, row, col, bySide) => {
	const board = position.board;
	return (
		attackedByPawn(board, row, col, bySide) ||
		attackedByKnight(board, row, col, bySide) ||
		attackedByKing(board, row, col, bySide) ||
		attackedBySliding(board, row, col, bySide, BISHOP_DIRS, ["b", "q"]) ||
		attackedBySliding(board, row, col, bySide, ROOK_DIRS, ["r", "q"])
	);
};

export const isKingInCheck = (position, side) => {
	const king = findKing(position, side);
	if (!king) return true;
	return isSquareAttacked(position, king.row, king.col, oppositeColor(side));
};

export const applyMove = (position, move) => {
	const board = cloneBoard(position.board);
	const piece = board[move.from.row][move.from.col];
	if (piece === null) {
		throw new Error("Cannot apply move from empty square");
	}

	const mover = position.sideToMove;
	const targetPiece = board[move.to.row][move.to.col];
	const isPawnMove = pieceType(piece) === "p";
	const isCapture = !!move.flags?.capture;

	board[move.from.row][move.from.col] = null;

	if (move.flags?.enPassant) {
		const capturedPawnRow = mover === WHITE ? move.to.row + 1 : move.to.row - 1;
		board[capturedPawnRow][move.to.col] = null;
	}

	let placedPiece = piece;
	if (move.flags?.promotion) {
		placedPiece =
			mover === WHITE
				? move.flags.promotion.toUpperCase()
				: move.flags.promotion;
	}
	board[move.to.row][move.to.col] = placedPiece;

	if (move.flags?.castle) {
		if (move.flags.castle === "K") {
			board[7][7] = null;
			board[7][5] = "R";
		} else if (move.flags.castle === "Q") {
			board[7][0] = null;
			board[7][3] = "R";
		} else if (move.flags.castle === "k") {
			board[0][7] = null;
			board[0][5] = "r";
		} else if (move.flags.castle === "q") {
			board[0][0] = null;
			board[0][3] = "r";
		}
	}

	let castling = position.castling;
	if (piece === "K") {
		castling = dropCastlingRight(dropCastlingRight(castling, "K"), "Q");
	}
	if (piece === "k") {
		castling = dropCastlingRight(dropCastlingRight(castling, "k"), "q");
	}
	if (piece === "R" && move.from.row === 7 && move.from.col === 0)
		castling = dropCastlingRight(castling, "Q");
	if (piece === "R" && move.from.row === 7 && move.from.col === 7)
		castling = dropCastlingRight(castling, "K");
	if (piece === "r" && move.from.row === 0 && move.from.col === 0)
		castling = dropCastlingRight(castling, "q");
	if (piece === "r" && move.from.row === 0 && move.from.col === 7)
		castling = dropCastlingRight(castling, "k");

	if (targetPiece === "R" && move.to.row === 7 && move.to.col === 0)
		castling = dropCastlingRight(castling, "Q");
	if (targetPiece === "R" && move.to.row === 7 && move.to.col === 7)
		castling = dropCastlingRight(castling, "K");
	if (targetPiece === "r" && move.to.row === 0 && move.to.col === 0)
		castling = dropCastlingRight(castling, "q");
	if (targetPiece === "r" && move.to.row === 0 && move.to.col === 7)
		castling = dropCastlingRight(castling, "k");

	let enPassant = "-";
	if (isPawnMove && Math.abs(move.to.row - move.from.row) === 2) {
		const epRow = (move.to.row + move.from.row) / 2;
		enPassant = coordsToSquare(epRow, move.from.col);
	}

	const halfmoveClock =
		isPawnMove || isCapture ? 0 : position.halfmoveClock + 1;
	const fullmoveNumber =
		mover === BLACK ? position.fullmoveNumber + 1 : position.fullmoveNumber;

	const nextPosition = {
		...position,
		board,
		sideToMove: oppositeColor(position.sideToMove),
		castling,
		enPassant,
		halfmoveClock,
		fullmoveNumber,
		repetitionKeys: Array.isArray(position.repetitionKeys)
			? [...position.repetitionKeys]
			: [],
		zobristKey:
			typeof position.zobristKey === "string" ? position.zobristKey : "",
	};

	return {
		...nextPosition,
		repetitionKeys: [
			...nextPosition.repetitionKeys,
			repetitionKey(nextPosition),
		],
	};
};

export const isCastlePathSafe = (position, move) => {
	if (!move.flags?.castle) return true;
	const side = position.sideToMove;
	if (isKingInCheck(position, side)) return false;

	const bySide = oppositeColor(side);
	const row = side === WHITE ? 7 : 0;
	const pathCols = move.to.col === 6 ? [5, 6] : [3, 2];
	return pathCols.every((col) => !isSquareAttacked(position, row, col, bySide));
};

export const hasRequiredCastleRook = (position, move) => {
	if (!move.flags?.castle) return true;
	const side = position.sideToMove;
	const row = side === WHITE ? 7 : 0;
	const rookCol = move.to.col === 6 ? 7 : 0;
	return position.board[row][rookCol] === rookPiece(side);
};
