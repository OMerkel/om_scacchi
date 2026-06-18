// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

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

const assertBoardShape = (board) => {
	if (!Array.isArray(board) || board.length !== 8) {
		throw new Error("Board must have 8 ranks");
	}
	if (board.some((rank) => !Array.isArray(rank) || rank.length !== 8)) {
		throw new Error("Each board rank must have 8 files");
	}
};

export const createEmptyBoard = () =>
	Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));

export const cloneBoard = (board) => {
	assertBoardShape(board);
	return board.map((rank) => [...rank]);
};

export const getPieceAt = (board, row, col) => {
	assertBoardShape(board);
	assertInBounds(row, col);
	return board[row][col];
};

export const withPieceAt = (board, row, col, piece) => {
	assertBoardShape(board);
	assertInBounds(row, col);
	if (piece !== null && (typeof piece !== "string" || piece.length !== 1)) {
		throw new Error("Piece must be null or one-character symbol");
	}

	const nextBoard = cloneBoard(board);
	nextBoard[row][col] = piece;
	return nextBoard;
};

export const withMovedPiece = (board, from, to) => {
	assertBoardShape(board);
	assertInBounds(from.row, from.col);
	assertInBounds(to.row, to.col);

	const piece = board[from.row][from.col];
	if (piece === null) {
		throw new Error("Cannot move from an empty square");
	}

	const nextBoard = cloneBoard(board);
	nextBoard[from.row][from.col] = null;
	nextBoard[to.row][to.col] = piece;
	return nextBoard;
};
