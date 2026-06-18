// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

export const WHITE = "w";
export const BLACK = "b";

export const PIECE_TYPES = Object.freeze({
	KING: "k",
	QUEEN: "q",
	ROOK: "r",
	BISHOP: "b",
	KNIGHT: "n",
	PAWN: "p",
});

export const isColor = (value) => value === WHITE || value === BLACK;

export const pieceColor = (piece) => {
	if (typeof piece !== "string" || piece.length !== 1) return null;
	if (piece >= "A" && piece <= "Z") return WHITE;
	if (piece >= "a" && piece <= "z") return BLACK;
	return null;
};

export const pieceType = (piece) => {
	if (typeof piece !== "string" || piece.length !== 1) return null;
	const normalized = piece.toLowerCase();
	return Object.values(PIECE_TYPES).includes(normalized) ? normalized : null;
};

export const isPieceOfColor = (piece, color) => {
	if (!isColor(color)) return false;
	return pieceColor(piece) === color;
};

export const oppositeColor = (color) => {
	if (!isColor(color)) {
		throw new Error("Color must be 'w' or 'b'");
	}
	return color === WHITE ? BLACK : WHITE;
};
