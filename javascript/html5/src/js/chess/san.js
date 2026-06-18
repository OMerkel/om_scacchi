// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Standard Algebraic Notation (SAN) utilities for chess moves.

import { coordsToSquare } from "./fen.js";
import { getGameStatus } from "./game.js";
import { generateLegalMoves, moveToUci } from "./move_generator.js";
import { applyMove, isKingInCheck } from "./rules.js";
import { PIECE_TYPES, pieceType } from "./types.js";

const FILES = "abcdefgh";

/**
 * Convert a move in the context of a position to a SAN string.
 *
 * @param {Object} position - Chess position
 * @param {Object} move     - Move object {from, to, flags}
 * @returns {string} SAN notation string
 */
export const moveToSan = (position, move) => {
	if (
		!position ||
		!move?.from ||
		!move.to ||
		!Number.isInteger(move.from.row) ||
		!Number.isInteger(move.from.col) ||
		!Number.isInteger(move.to.row) ||
		!Number.isInteger(move.to.col)
	) {
		return "?";
	}
	const piece = position.board[move.from.row][move.from.col];
	if (!piece) return "?";

	const type = pieceType(piece);
	const isCapture = !!move.flags?.capture;
	const destSq = coordsToSquare(move.to.row, move.to.col);

	// Castling
	if (move.flags?.castle) {
		const isKingside = move.flags.castle === "K" || move.flags.castle === "k";
		let san = isKingside ? "O-O" : "O-O-O";
		const nextPos = applyMove(position, move);
		const status = getGameStatus(nextPos);
		if (status.reason === "checkmate") san += "#";
		else if (isKingInCheck(nextPos, nextPos.sideToMove)) san += "+";
		return san;
	}

	let san = "";

	if (type === PIECE_TYPES.PAWN) {
		san = isCapture ? `${FILES[move.from.col]}x${destSq}` : destSq;
		if (move.flags?.promotion) {
			san += `=${move.flags.promotion.toUpperCase()}`;
		}
	} else {
		const pieceLetter = type.toUpperCase();

		// Disambiguation: find other legal moves by the same piece type to the same destination.
		const legal = generateLegalMoves(position);
		const ambiguous = legal.filter((m) => {
			if (m.from.row === move.from.row && m.from.col === move.from.col)
				return false;
			const p = position.board[m.from.row][m.from.col];
			return (
				pieceType(p) === type &&
				m.to.row === move.to.row &&
				m.to.col === move.to.col
			);
		});

		let disambig = "";
		if (ambiguous.length > 0) {
			const sameFile = ambiguous.some((m) => m.from.col === move.from.col);
			const sameRank = ambiguous.some((m) => m.from.row === move.from.row);
			if (!sameFile) {
				disambig = FILES[move.from.col];
			} else if (!sameRank) {
				disambig = String(8 - move.from.row);
			} else {
				disambig = coordsToSquare(move.from.row, move.from.col);
			}
		}

		san = pieceLetter + disambig + (isCapture ? "x" : "") + destSq;
	}

	// Check / checkmate suffix
	const nextPos = applyMove(position, move);
	const status = getGameStatus(nextPos);
	if (status.reason === "checkmate") {
		san += "#";
	} else if (isKingInCheck(nextPos, nextPos.sideToMove)) {
		san += "+";
	}

	return san;
};

/**
 * Convert an array of UCI strings to a SAN line string (principal variation).
 * Stops at the first UCI string that does not match a legal move.
 *
 * @param {Object}   position - Starting position
 * @param {string[]} pvUci    - Array of UCI strings, e.g. ['e2e4','d7d5']
 * @returns {string} Space-separated SAN string, e.g. "e4 d5 Nf3"
 */
export const pvToSan = (position, pvUci) => {
	if (!Array.isArray(pvUci) || pvUci.length === 0) return "";
	const parts = [];
	let pos = position;

	for (const uci of pvUci) {
		const legal = generateLegalMoves(pos);
		const match = legal.find((m) => moveToUci(m) === uci);
		if (!match) break;
		parts.push(moveToSan(pos, match));
		pos = applyMove(pos, match);
	}

	return parts.join(" ");
};
