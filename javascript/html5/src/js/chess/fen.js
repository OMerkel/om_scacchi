// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

const FILES = "abcdefgh";
const PIECES = new Set([
	"p",
	"n",
	"b",
	"r",
	"q",
	"k",
	"P",
	"N",
	"B",
	"R",
	"Q",
	"K",
]);

export const STANDARD_INITIAL_FEN =
	"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const INITIAL_FEN = STANDARD_INITIAL_FEN;

const isSquare = (value) => /^[a-h][1-8]$/.test(value);
const isEnPassantSquare = (value) => /^[a-h][36]$/.test(value);

const validateCastlingField = (castlingField) => {
	if (castlingField === "-") return;
	if (!/^[KQkq]+$/.test(castlingField)) {
		throw new Error("FEN castling field must contain only KQkq or -");
	}

	const seen = new Set();
	for (const token of castlingField) {
		if (seen.has(token)) {
			throw new Error("FEN castling field must not contain duplicate rights");
		}
		seen.add(token);
	}
};

const decodeRank = (rankText) => {
	const rank = [];
	for (const token of rankText) {
		if (/^[1-8]$/.test(token)) {
			const count = Number.parseInt(token, 10);
			for (let i = 0; i < count; i += 1) rank.push(null);
			continue;
		}
		if (!PIECES.has(token)) {
			throw new Error(`FEN placement contains unsupported piece '${token}'`);
		}
		rank.push(token);
	}

	if (rank.length !== 8) {
		throw new Error("Each FEN rank must describe exactly 8 squares");
	}
	return rank;
};

const encodeRank = (rank) => {
	let out = "";
	let empties = 0;
	for (const square of rank) {
		if (square === null) {
			empties += 1;
		} else {
			if (empties > 0) {
				out += String(empties);
				empties = 0;
			}
			out += square;
		}
	}
	if (empties > 0) out += String(empties);
	return out;
};

const validateKingsAndPawns = (board) => {
	const flat = board.flat();
	const whiteKings = flat.filter((piece) => piece === "K").length;
	const blackKings = flat.filter((piece) => piece === "k").length;

	if (whiteKings !== 1 || blackKings !== 1) {
		throw new Error(
			"FEN position must contain exactly one white king and one black king",
		);
	}

	const invalidWhitePawn =
		board[0].some((piece) => piece === "P") ||
		board[7].some((piece) => piece === "P");
	const invalidBlackPawn =
		board[0].some((piece) => piece === "p") ||
		board[7].some((piece) => piece === "p");
	if (invalidWhitePawn || invalidBlackPawn) {
		throw new Error("FEN position must not place pawns on rank 1 or rank 8");
	}
};

const normalizeCastling = (castlingField) => {
	if (castlingField === "-") return "-";
	const ordered = ["K", "Q", "k", "q"].filter((token) =>
		castlingField.includes(token),
	);
	return ordered.join("") || "-";
};

const cloneBoard = (board) => board.map((rank) => [...rank]);

export const parseFen = (fenText) => {
	if (typeof fenText !== "string" || fenText.trim().length === 0) {
		throw new Error("FEN must be a non-empty string");
	}

	const parts = fenText.trim().split(/\s+/);
	if (parts.length !== 6) {
		throw new Error("FEN must contain exactly 6 fields");
	}

	const [
		placementField,
		sideField,
		castlingField,
		enPassantField,
		halfMoveField,
		fullMoveField,
	] = parts;

	const ranks = placementField.split("/");
	if (ranks.length !== 8) {
		throw new Error("FEN placement must contain exactly 8 ranks");
	}

	const board = ranks.map(decodeRank);
	validateKingsAndPawns(board);

	if (sideField !== "w" && sideField !== "b") {
		throw new Error("FEN side to move must be 'w' or 'b'");
	}

	validateCastlingField(castlingField);

	if (enPassantField !== "-" && !isEnPassantSquare(enPassantField)) {
		throw new Error("FEN en passant field must be - or a square on rank 3/6");
	}

	const halfmoveClock = Number.parseInt(halfMoveField, 10);
	if (!Number.isInteger(halfmoveClock) || halfmoveClock < 0) {
		throw new Error("FEN halfmove clock must be a non-negative integer");
	}

	const fullmoveNumber = Number.parseInt(fullMoveField, 10);
	if (!Number.isInteger(fullmoveNumber) || fullmoveNumber <= 0) {
		throw new Error("FEN fullmove number must be a positive integer");
	}

	return {
		board,
		sideToMove: sideField,
		castling: normalizeCastling(castlingField),
		enPassant: enPassantField,
		halfmoveClock,
		fullmoveNumber,
	};
};

export const serializeFen = (position) => {
	if (!position || typeof position !== "object") {
		throw new Error("Position object is required");
	}

	const {
		board,
		sideToMove,
		castling,
		enPassant,
		halfmoveClock,
		fullmoveNumber,
	} = position;

	if (
		!Array.isArray(board) ||
		board.length !== 8 ||
		board.some((rank) => !Array.isArray(rank) || rank.length !== 8)
	) {
		throw new Error("Position board must be an 8x8 array");
	}

	for (const rank of board) {
		for (const square of rank) {
			if (square !== null && !PIECES.has(square)) {
				throw new Error("Position board contains unsupported piece symbol");
			}
		}
	}

	validateKingsAndPawns(board);

	if (sideToMove !== "w" && sideToMove !== "b") {
		throw new Error("Position sideToMove must be 'w' or 'b'");
	}

	const normalizedCastling = castling ?? "-";
	validateCastlingField(normalizedCastling);

	if (enPassant !== "-" && !isEnPassantSquare(enPassant)) {
		throw new Error("Position enPassant must be - or a square on rank 3/6");
	}

	if (!Number.isInteger(halfmoveClock) || halfmoveClock < 0) {
		throw new Error("Position halfmoveClock must be a non-negative integer");
	}

	if (!Number.isInteger(fullmoveNumber) || fullmoveNumber <= 0) {
		throw new Error("Position fullmoveNumber must be a positive integer");
	}

	const placementField = board.map(encodeRank).join("/");
	const castlingField = normalizeCastling(normalizedCastling);

	return `${placementField} ${sideToMove} ${castlingField} ${enPassant} ${halfmoveClock} ${fullmoveNumber}`;
};

export const isValidFen = (fenText) => {
	try {
		parseFen(fenText);
		return true;
	} catch {
		return false;
	}
};

export const squareToCoords = (square) => {
	if (!isSquare(square)) {
		throw new Error("Square must match [a-h][1-8]");
	}
	return {
		row: 8 - Number.parseInt(square[1], 10),
		col: FILES.indexOf(square[0]),
	};
};

export const coordsToSquare = (row, col) => {
	if (
		!Number.isInteger(row) ||
		!Number.isInteger(col) ||
		row < 0 ||
		row > 7 ||
		col < 0 ||
		col > 7
	) {
		throw new Error("Coordinates must be integers in board range");
	}
	return `${FILES[col]}${8 - row}`;
};

export const createInitialPosition = () => parseFen(STANDARD_INITIAL_FEN);

export const clonePosition = (position) => ({
	...position,
	board: cloneBoard(position.board),
});
