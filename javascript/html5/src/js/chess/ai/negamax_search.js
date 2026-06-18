// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { serializeFen } from "../fen.js";
import { getGameStatus } from "../game.js";
import { generateLegalMoves, moveToUci } from "../move_generator.js";
import { applyMove, isKingInCheck } from "../rules.js";
import { createTranspositionTable } from "../transposition_table.js";
import { pieceType } from "../types.js";
import { DEFAULT_WEIGHTS } from "./eval_weights.js";
import {
	orderQuiescenceMoves,
	staticExchangeEvaluation,
} from "./move_ordering.js";

const MATE_SCORE = 100000;
const SEARCH_SCORE_BOUND = Number.MAX_SAFE_INTEGER;
const SCORE_SANITY_LIMIT = MATE_SCORE * 2;

const sanitizeScore = (score) => {
	if (!Number.isFinite(score)) {
		return score < 0 ? -SCORE_SANITY_LIMIT : SCORE_SANITY_LIMIT;
	}
	if (score > SCORE_SANITY_LIMIT) return SCORE_SANITY_LIMIT;
	if (score < -SCORE_SANITY_LIMIT) return -SCORE_SANITY_LIMIT;
	return Math.round(score);
};

const PIECE_VALUE = Object.freeze({
	p: 100,
	n: 320,
	b: 330,
	r: 500,
	q: 900,
	k: 0,
});

const PAWN_PST = Object.freeze([
	0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10,
	-5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30,
	30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0,
]);

const KNIGHT_PST = Object.freeze([
	-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30,
	0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20,
	15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
	-50, -40, -30, -30, -30, -30, -40, -50,
]);

const BISHOP_PST = Object.freeze([
	-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5,
	10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0,
	-10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
	-10, -10, -10, -10, -10, -20,
]);

const ROOK_PST = Object.freeze([
	0, 0, 0, 5, 5, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
	-5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
	5, 10, 10, 10, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
]);

const QUEEN_PST = Object.freeze([
	-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5,
	5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5,
	5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10,
	-20,
]);

const KING_PST = Object.freeze([
	-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
	-30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40,
	-40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20,
	-20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
]);

const KING_ENDGAME_PST = Object.freeze([
	-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30,
	-30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30,
	-10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30,
	0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
]);

const PST_BY_TYPE = Object.freeze({
	p: PAWN_PST,
	n: KNIGHT_PST,
	b: BISHOP_PST,
	r: ROOK_PST,
	q: QUEEN_PST,
});

const PHASE_WEIGHT = Object.freeze({
	n: 1,
	b: 1,
	r: 2,
	q: 4,
});

const MAX_PHASE = 24;

const positionIndex = (row, col, isWhite) => {
	if (isWhite) return row * 8 + col;
	return (7 - row) * 8 + col;
};

const evaluateMaterial = (position) => {
	let white = 0;
	let black = 0;

	for (const rank of position.board) {
		for (const piece of rank) {
			if (!piece) continue;
			const value = PIECE_VALUE[pieceType(piece)];
			if (piece === piece.toUpperCase()) white += value;
			else black += value;
		}
	}

	return white - black;
};

const evaluatePieceSquare = (position) => {
	let white = 0;
	let black = 0;

	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[row][col];
			if (!piece) continue;
			const type = pieceType(piece);
			const pst = PST_BY_TYPE[type];
			if (!pst) continue;
			const isWhite = piece === piece.toUpperCase();
			const idx = positionIndex(row, col, isWhite);
			if (isWhite) white += pst[idx];
			else black += pst[idx];
		}
	}

	return white - black;
};

const evaluateKingSquareTapered = (position) => {
	let whiteMg = 0;
	let blackMg = 0;
	let whiteEg = 0;
	let blackEg = 0;

	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[row][col];
			if (!piece || pieceType(piece) !== "k") continue;
			const isWhite = piece === piece.toUpperCase();
			const idx = positionIndex(row, col, isWhite);
			if (isWhite) {
				whiteMg += KING_PST[idx];
				whiteEg += KING_ENDGAME_PST[idx];
			} else {
				blackMg += KING_PST[idx];
				blackEg += KING_ENDGAME_PST[idx];
			}
		}
	}

	let phase = 0;
	for (const rank of position.board) {
		for (const piece of rank) {
			if (!piece) continue;
			phase += PHASE_WEIGHT[pieceType(piece)] ?? 0;
		}
	}
	phase = Math.min(MAX_PHASE, phase);

	const mg = whiteMg - blackMg;
	const eg = whiteEg - blackEg;
	return Math.round((mg * phase + eg * (MAX_PHASE - phase)) / MAX_PHASE);
};

const evaluateBishopPair = (position, W) => {
	let white = 0;
	let black = 0;
	for (const rank of position.board) {
		for (const piece of rank) {
			if (!piece || pieceType(piece) !== "b") continue;
			if (piece === piece.toUpperCase()) white += 1;
			else black += 1;
		}
	}
	return (
		(white >= 2 ? W.bishopPairBonus : 0) - (black >= 2 ? W.bishopPairBonus : 0)
	);
};

const evaluateRookFiles = (position, W) => {
	let score = 0;
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[row][col];
			if (!piece || pieceType(piece) !== "r") continue;
			const isWhite = piece === piece.toUpperCase();

			let hasAnyPawn = false;
			let hasOwnPawn = false;
			for (let r = 0; r < 8; r += 1) {
				const target = position.board[r][col];
				if (!target || pieceType(target) !== "p") continue;
				hasAnyPawn = true;
				if ((target === target.toUpperCase()) === isWhite) hasOwnPawn = true;
			}

			let bonus = 0;
			if (!hasAnyPawn) bonus = W.rookOpenFileBonus;
			else if (!hasOwnPawn) bonus = W.rookSemiOpenFileBonus;
			score += isWhite ? bonus : -bonus;
		}
	}
	return score;
};

const evaluatePassedPawns = (position, W) => {
	let score = 0;
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[row][col];
			if (!piece || pieceType(piece) !== "p") continue;
			const isWhite = piece === piece.toUpperCase();
			const dir = isWhite ? -1 : 1;
			let blocked = false;

			for (let r = row + dir; r >= 0 && r < 8; r += dir) {
				for (let dc = -1; dc <= 1; dc += 1) {
					const c = col + dc;
					if (c < 0 || c > 7) continue;
					const target = position.board[r][c];
					if (!target || pieceType(target) !== "p") continue;
					if ((target === target.toUpperCase()) !== isWhite) blocked = true;
				}
			}

			if (blocked) continue;
			const advancement = isWhite ? 7 - row : row;
			const bonus = W.passedPawnBase + advancement * W.passedPawnAdvancement;
			score += isWhite ? bonus : -bonus;
		}
	}
	return score;
};

const evaluateKingSafety = (position, W) => {
	let whiteKing = { row: 7, col: 4 };
	let blackKing = { row: 0, col: 4 };
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[row][col];
			if (piece === "K") whiteKing = { row, col };
			if (piece === "k") blackKing = { row, col };
		}
	}

	let whiteShield = 0;
	let blackShield = 0;
	for (let dc = -1; dc <= 1; dc += 1) {
		const wCol = whiteKing.col + dc;
		const bCol = blackKing.col + dc;

		if (wCol >= 0 && wCol <= 7 && whiteKing.row > 0) {
			if (position.board[whiteKing.row - 1][wCol] === "P") whiteShield += 1;
		}
		if (bCol >= 0 && bCol <= 7 && blackKing.row < 7) {
			if (position.board[blackKing.row + 1][bCol] === "p") blackShield += 1;
		}
	}

	return (whiteShield - blackShield) * W.kingSafetyPawnShield;
};

const evaluatePawnStructure = (position, W) => {
	let score = 0;
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[row][col];
			if (!piece || pieceType(piece) !== "p") continue;
			const isWhite = piece === piece.toUpperCase();

			// Isolated pawn: no pawn on adjacent files
			let hasAdjacent = false;
			if (col > 0 && position.board[row][col - 1]) {
				const adj = position.board[row][col - 1];
				if (pieceType(adj) === "p" && (adj === adj.toUpperCase()) === isWhite) {
					hasAdjacent = true;
				}
			}
			if (col < 7 && position.board[row][col + 1]) {
				const adj = position.board[row][col + 1];
				if (pieceType(adj) === "p" && (adj === adj.toUpperCase()) === isWhite) {
					hasAdjacent = true;
				}
			}
			if (!hasAdjacent) {
				score += isWhite ? -W.isolatedPawnPenalty : W.isolatedPawnPenalty;
			}

			// Doubled pawn: another pawn on same file
			let hasDouble = false;
			for (let r = 0; r < 8; r += 1) {
				if (r !== row) {
					const other = position.board[r][col];
					if (
						other &&
						pieceType(other) === "p" &&
						(other === other.toUpperCase()) === isWhite
					) {
						hasDouble = true;
						break;
					}
				}
			}
			if (hasDouble) {
				score += isWhite ? -W.doubledPawnPenalty : W.doubledPawnPenalty;
			}
		}
	}
	return score;
};

const evaluateConnectedPassers = (position, W) => {
	let score = 0;
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 7; col += 1) {
			const p1 = position.board[row][col];
			const p2 = position.board[row][col + 1];
			if (!p1 || !p2 || pieceType(p1) !== "p" || pieceType(p2) !== "p")
				continue;
			if ((p1 === p1.toUpperCase()) !== (p2 === p2.toUpperCase())) continue;

			// Both are pawns of same color on adjacent files at same rank
			// Check if both are passed
			const isWhite = p1 === p1.toUpperCase();
			let p1Passed = true,
				p2Passed = true;
			const dir = isWhite ? -1 : 1;

			// Check p1 for blockage
			for (let r = row + dir; r >= 0 && r < 8; r += dir) {
				for (let dc = -1; dc <= 1; dc += 1) {
					const c = col + dc;
					if (c < 0 || c > 7) continue;
					const target = position.board[r][c];
					if (
						target &&
						pieceType(target) === "p" &&
						(target === target.toUpperCase()) !== isWhite
					) {
						p1Passed = false;
					}
				}
			}

			// Check p2 for blockage
			for (let r = row + dir; r >= 0 && r < 8; r += dir) {
				for (let dc = -1; dc <= 1; dc += 1) {
					const c = col + 1 + dc;
					if (c < 0 || c > 7) continue;
					const target = position.board[r][c];
					if (
						target &&
						pieceType(target) === "p" &&
						(target === target.toUpperCase()) !== isWhite
					) {
						p2Passed = false;
					}
				}
			}

			if (p1Passed && p2Passed) {
				const bonus = W.connectedPassersBonus;
				score += isWhite ? bonus : -bonus;
			}
		}
	}
	return score;
};

const countMobility = (position, sideToMove) =>
	generateLegalMoves({ ...position, sideToMove }).length;

const evaluatePins = (position, W) => {
	let score = 0;

	// For each piece, check if it's pinned to its king
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[row][col];
			if (!piece || pieceType(piece) === "k") continue;

			const isWhite = piece === piece.toUpperCase();

			// Find king of same color
			let kingRow = -1,
				kingCol = -1;
			for (let r = 0; r < 8; r += 1) {
				for (let c = 0; c < 8; c += 1) {
					const k = position.board[r][c];
					if (k === (isWhite ? "K" : "k")) {
						kingRow = r;
						kingCol = c;
					}
				}
			}

			if (kingRow === -1) continue;

			// Check if piece is on straight line with king
			const onSameLine =
				row === kingRow ||
				col === kingCol ||
				Math.abs(row - kingRow) === Math.abs(col - kingCol);

			if (!onSameLine) continue;

			// Check if there's an attacker beyond this piece
			const dRow = kingRow === row ? 0 : kingRow > row ? 1 : -1;
			const dCol = kingCol === col ? 0 : kingCol > col ? 1 : -1;

			// Scan from piece toward king (empty)
			// Scan from piece away from king to find attacker
			let foundAttacker = false;
			for (
				let r = row + dRow, c = col + dCol;
				r >= 0 && r < 8 && c >= 0 && c < 8;
				r += dRow, c += dCol
			) {
				if (r === kingRow && c === kingCol) break; // Reached king, no attacker
				const target = position.board[r][c];
				if (!target) continue;

				const targetIsWhite = target === target.toUpperCase();
				if (targetIsWhite === isWhite) break; // Friendly piece blocks

				const type = pieceType(target);
				// Check if it's a piece that attacks along this line
				if (type === "r" || type === "q") {
					if (dRow !== 0 || dCol !== 0) {
						if (dRow === 0 || dCol === 0 || Math.abs(dRow) === Math.abs(dCol)) {
							foundAttacker = true;
							break;
						}
					}
				} else if (type === "b" || type === "q") {
					if (Math.abs(dRow) === Math.abs(dCol)) {
						foundAttacker = true;
						break;
					}
				}
				break;
			}

			if (foundAttacker) {
				// Piece is pinned: reduce its value significantly
				const penalty =
					pieceType(piece) === "q"
						? -W.pinnedQueenPenalty
						: pieceType(piece) === "r"
							? -W.pinnedRookPenalty
							: -W.pinnedMinorPenalty;
				score += isWhite ? penalty : -penalty;
			}
		}
	}

	return score;
};

const evaluateBackRankWeakness = (position, W) => {
	let score = 0;

	// Check each side's back rank (rank 0 for black, rank 7 for white)
	for (const [side, backRank] of [
		["w", 7],
		["b", 0],
	]) {
		// Check if king is on or near back rank
		let kingFound = false;
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[backRank][col];
			if (piece === (side === "w" ? "K" : "k")) {
				kingFound = true;
				break;
			}
		}

		if (!kingFound) continue; // King not on back rank, less concern

		// Count undefended pieces on back rank
		let undefended = 0;
		for (let col = 0; col < 8; col += 1) {
			const piece = position.board[backRank][col];
			if (!piece) continue;
			const isOwn = (piece === piece.toUpperCase()) === (side === "w");
			if (!isOwn || pieceType(piece) === "k") continue;

			// Check if piece is defended on back rank
			let defended = false;
			for (let dc = -1; dc <= 1; dc += 1) {
				const defenderCol = col + dc;
				if (defenderCol < 0 || defenderCol > 7) continue;
				const defender = position.board[backRank][defenderCol];
				if (defender && pieceType(defender) === "k") {
					defended = true;
				}
			}

			if (!defended && pieceType(piece) !== "p") {
				undefended += 1;
			}
		}

		// Check if opponent has major pieces that can attack back rank
		let opponentThreats = 0;
		for (const rank of position.board) {
			for (const piece of rank) {
				if (!piece) continue;
				const isOpponent = (piece === piece.toUpperCase()) !== (side === "w");
				const type = pieceType(piece);
				if (isOpponent && (type === "r" || type === "q")) {
					opponentThreats += 1;
				}
			}
		}

		if (undefended > 0 && opponentThreats > 0) {
			const penalty = -W.backRankWeaknessPenalty * undefended;
			score += side === "w" ? penalty : -penalty;
		}
	}

	return score;
};

const evaluateAttackCoordination = (position, W) => {
	let score = 0;

	for (const side of ["w", "b"]) {
		const isWhite = side === "w";

		// Find opponent king
		let kingRow = -1,
			kingCol = -1;
		for (let row = 0; row < 8; row += 1) {
			for (let col = 0; col < 8; col += 1) {
				const piece = position.board[row][col];
				if (piece === (isWhite ? "k" : "K")) {
					kingRow = row;
					kingCol = col;
				}
			}
		}

		if (kingRow === -1) continue;

		// Count attackers and defenders
		let attackers = 0;
		let defenders = 0;

		// Check which of our pieces attack king square
		for (let row = 0; row < 8; row += 1) {
			for (let col = 0; col < 8; col += 1) {
				const piece = position.board[row][col];
				if (!piece || pieceType(piece) === "k") continue;

				const isOwn = (piece === piece.toUpperCase()) === isWhite;
				if (!isOwn) continue;

				const type = pieceType(piece);
				const dRow = kingRow - row;
				const dCol = kingCol - col;

				let attacks = false;
				if (type === "p") {
					const pawnDir = isWhite ? -1 : 1;
					if (dRow === pawnDir && Math.abs(dCol) === 1) attacks = true;
				} else if (type === "n") {
					if (
						(Math.abs(dRow) === 2 && Math.abs(dCol) === 1) ||
						(Math.abs(dRow) === 1 && Math.abs(dCol) === 2)
					)
						attacks = true;
				} else if (type === "b") {
					if (Math.abs(dRow) === Math.abs(dCol) && dRow !== 0) attacks = true;
				} else if (type === "r") {
					if ((dRow === 0 || dCol === 0) && dRow !== 0 && dCol !== 0)
						attacks = true;
				} else if (type === "q") {
					if (
						(dRow === 0 || dCol === 0 || Math.abs(dRow) === Math.abs(dCol)) &&
						(dRow !== 0 || dCol !== 0)
					)
						attacks = true;
				}

				if (attacks) attackers += 1;
			}
		}

		// Check which opponent pieces defend king
		for (let row = 0; row < 8; row += 1) {
			for (let col = 0; col < 8; col += 1) {
				const piece = position.board[row][col];
				if (!piece || pieceType(piece) === "k") continue;

				const isOwn = (piece === piece.toUpperCase()) === isWhite;
				if (isOwn) continue;

				const type = pieceType(piece);
				const dRow = kingRow - row;
				const dCol = kingCol - col;

				let defends = false;
				if (type === "p") {
					const pawnDir = isWhite ? 1 : -1;
					if (dRow === pawnDir && Math.abs(dCol) === 1) defends = true;
				} else if (type === "n") {
					if (
						(Math.abs(dRow) === 2 && Math.abs(dCol) === 1) ||
						(Math.abs(dRow) === 1 && Math.abs(dCol) === 2)
					)
						defends = true;
				} else if (type === "b") {
					if (Math.abs(dRow) === Math.abs(dCol) && dRow !== 0) defends = true;
				} else if (type === "r") {
					if ((dRow === 0 || dCol === 0) && dRow !== 0 && dCol !== 0)
						defends = true;
				} else if (type === "q") {
					if (
						(dRow === 0 || dCol === 0 || Math.abs(dRow) === Math.abs(dCol)) &&
						(dRow !== 0 || dCol !== 0)
					)
						defends = true;
				}

				if (defends) defenders += 1;
			}
		}

		// Heavily reward when we have more attackers than defenders
		const coordinationBonus = Math.max(
			0,
			(attackers - defenders) * W.coordinationBonusPerAttacker,
		);
		score += isWhite ? coordinationBonus : -coordinationBonus;
	}

	return score;
};

const evaluateMateThreat = (position, W) => {
	let score = 0;

	for (const side of ["w", "b"]) {
		const isWhite = side === "w";

		let kingRow = -1,
			kingCol = -1;
		for (let row = 0; row < 8; row += 1) {
			for (let col = 0; col < 8; col += 1) {
				const piece = position.board[row][col];
				if (piece === (isWhite ? "K" : "k")) {
					kingRow = row;
					kingCol = col;
				}
			}
		}

		if (kingRow === -1) continue;

		let threatCount = 0;
		for (let row = 0; row < 8; row += 1) {
			for (let col = 0; col < 8; col += 1) {
				const piece = position.board[row][col];
				if (!piece) continue;
				const isOpponent = (piece === piece.toUpperCase()) !== isWhite;
				if (!isOpponent) continue;

				const type = pieceType(piece);
				if (type !== "r" && type !== "q") continue;

				const dRow = kingRow - row;
				const dCol = kingCol - col;

				if (type === "r" && (dRow === 0 || dCol === 0)) {
					threatCount += 1;
				} else if (type === "q") {
					if (dRow === 0 || dCol === 0 || Math.abs(dRow) === Math.abs(dCol)) {
						threatCount += 1;
					}
				}
			}
		}

		let escapeSquares = 0;
		for (let dr = -1; dr <= 1; dr += 1) {
			for (let dc = -1; dc <= 1; dc += 1) {
				if (dr === 0 && dc === 0) continue;
				const r = kingRow + dr;
				const c = kingCol + dc;
				if (r < 0 || r > 7 || c < 0 || c > 7) continue;

				const target = position.board[r][c];
				const isOwn = target && (target === target.toUpperCase()) === isWhite;
				if (!isOwn) escapeSquares += 1;
			}
		}

		if (threatCount >= 2 && escapeSquares <= 1) {
			const penalty = threatCount * W.mateThreatPenaltyPerThreat;
			score += isWhite ? -penalty : penalty;
		}
	}

	return score;
};

const evaluatePosition = (position, W = DEFAULT_WEIGHTS) => {
	const material = evaluateMaterial(position);
	const pst = evaluatePieceSquare(position);
	const kingTapered = evaluateKingSquareTapered(position);
	const bishopPair = evaluateBishopPair(position, W);
	const rookFiles = evaluateRookFiles(position, W);
	const passedPawns = evaluatePassedPawns(position, W);
	const kingSafety = evaluateKingSafety(position, W);
	const pawnStructure = evaluatePawnStructure(position, W);
	const connectedPassers = evaluateConnectedPassers(position, W);
	const pins = evaluatePins(position, W);
	const backRankWeakness = evaluateBackRankWeakness(position, W);
	const attackCoordination = evaluateAttackCoordination(position, W);
	const mateThreats = evaluateMateThreat(position, W);
	const mobility = countMobility(position, "w") - countMobility(position, "b");
	const checkPressure =
		(isKingInCheck({ ...position, sideToMove: "b" }, "b")
			? W.checkPressureBonus
			: 0) -
		(isKingInCheck({ ...position, sideToMove: "w" }, "w")
			? W.checkPressureBonus
			: 0);

	return (
		material +
		pst +
		kingTapered +
		bishopPair +
		rookFiles +
		passedPawns +
		kingSafety +
		pawnStructure +
		connectedPassers +
		pins +
		backRankWeakness +
		attackCoordination +
		mateThreats +
		mobility * 5 +
		checkPressure
	);
};

const evaluateForSideToMove = (position, W = DEFAULT_WEIGHTS) => {
	const whiteMinusBlack = evaluatePosition(position, W);
	return position.sideToMove === "w" ? whiteMinusBlack : -whiteMinusBlack;
};

const isQuietMove = (move) => !move.flags?.capture && !move.flags?.promotion;

const isTacticalMove = (position, move) => {
	if (move.flags?.capture || move.flags?.promotion) return true;
	const next = applyMove(position, move);
	return isKingInCheck(next, next.sideToMove);
};

const hasNonPawnMaterial = (position, side) => {
	for (const rank of position.board) {
		for (const piece of rank) {
			if (!piece) continue;
			const isWhite = piece === piece.toUpperCase();
			if ((side === "w" && !isWhite) || (side === "b" && isWhite)) continue;
			const type = pieceType(piece);
			if (type !== "p" && type !== "k") return true;
		}
	}
	return false;
};

const makeNullMove = (position) => ({
	...position,
	sideToMove: position.sideToMove === "w" ? "b" : "w",
	enPassant: "-",
	halfmoveClock: (position.halfmoveClock ?? 0) + 1,
	fullmoveNumber:
		position.sideToMove === "b"
			? (position.fullmoveNumber ?? 1) + 1
			: position.fullmoveNumber,
});

const isSoftTimeExceeded = (state) =>
	state.softTimeMs > 0 && Date.now() - state.startTime >= state.softTimeMs;

const isHardTimeExceeded = (state) =>
	state.hardTimeMs > 0 && Date.now() - state.startTime >= state.hardTimeMs;

const orderMoves = (
	position,
	moves,
	state,
	ply,
	ttMoveUci = null,
	prevMoveUci = null,
) => {
	const baseOrder = orderQuiescenceMoves(position, moves, { ttMoveUci });
	const baseRank = new Map(
		baseOrder.map((move, index) => [moveToUci(move), baseOrder.length - index]),
	);
	const killers = state.killerMoves[ply] ?? [null, null];

	return [...moves].sort((a, b) => {
		const uciA = moveToUci(a);
		const uciB = moveToUci(b);

		let scoreA = baseRank.get(uciA) ?? 0;
		let scoreB = baseRank.get(uciB) ?? 0;

		if (isQuietMove(a)) {
			if (killers[0] === uciA) scoreA += 1_000_000;
			else if (killers[1] === uciA) scoreA += 900_000;
			if (prevMoveUci && state.counterMoves.get(prevMoveUci) === uciA) {
				scoreA += 800_000;
			}
			scoreA += state.historyHeuristic.get(uciA) ?? 0;
		}
		if (isQuietMove(b)) {
			if (killers[0] === uciB) scoreB += 1_000_000;
			else if (killers[1] === uciB) scoreB += 900_000;
			if (prevMoveUci && state.counterMoves.get(prevMoveUci) === uciB) {
				scoreB += 800_000;
			}
			scoreB += state.historyHeuristic.get(uciB) ?? 0;
		}

		return scoreB - scoreA;
	});
};

const updateKillers = (state, ply, moveUci) => {
	if (!state.killerMoves[ply]) state.killerMoves[ply] = [null, null];
	const killers = state.killerMoves[ply];
	if (killers[0] !== moveUci) killers[1] = killers[0];
	killers[0] = moveUci;
};

const updateHistory = (state, moveUci, depth) => {
	const current = state.historyHeuristic.get(moveUci) ?? 0;
	const bonus = depth * depth;
	state.historyHeuristic.set(moveUci, current + bonus);
};

const quiescence = (position, alpha, beta, state) => {
	state.nodes += 1;
	if (state.nodes >= state.maxNodes)
		return sanitizeScore(evaluateForSideToMove(position));

	const standPat = sanitizeScore(evaluateForSideToMove(position));
	if (standPat >= beta) return standPat;
	let best = Math.max(alpha, standPat);

	const legalMoves = generateLegalMoves(position);
	const tacticalMoves = legalMoves.filter((move) =>
		isTacticalMove(position, move),
	);
	if (tacticalMoves.length === 0) return best;

	const ordered = orderMoves(position, tacticalMoves, state, 0);
	for (const move of ordered) {
		const next = applyMove(position, move);

		// Delta pruning: skip clearly bad losing captures that don't give check
		if (move.flags?.capture) {
			const see = staticExchangeEvaluation(position, move);
			if (see < -200 && !isKingInCheck(next, next.sideToMove)) {
				continue;
			}
		}

		const score = sanitizeScore(-quiescence(next, -beta, -best, state));

		if (score >= beta) return sanitizeScore(score);
		if (score > best) best = score;
	}

	return sanitizeScore(best);
};

const negamax = (
	position,
	depth,
	alpha,
	beta,
	state,
	ply = 0,
	allowNullMove = true,
	prevMoveUci = null,
) => {
	if (isHardTimeExceeded(state)) {
		return { score: sanitizeScore(evaluateForSideToMove(position)), pv: [] };
	}

	const fenKey = serializeFen(position);
	const ttEntry = state.tt.get(fenKey, position.sideToMove);
	if (ttEntry && ttEntry.depth >= depth) {
		if (ttEntry.flag === "EXACT")
			return {
				score: ttEntry.score,
				pv: ttEntry.bestMoveUci ? [ttEntry.bestMoveUci] : [],
			};
		if (ttEntry.flag === "LOWER" && ttEntry.score > alpha)
			alpha = ttEntry.score;
		if (ttEntry.flag === "UPPER" && ttEntry.score < beta) beta = ttEntry.score;
		if (alpha >= beta)
			return {
				score: ttEntry.score,
				pv: ttEntry.bestMoveUci ? [ttEntry.bestMoveUci] : [],
			};
	}

	if (depth <= 0) {
		const score = sanitizeScore(quiescence(position, alpha, beta, state));
		return { score, pv: [] };
	}

	state.nodes += 1;
	if (state.nodes >= state.maxNodes) {
		return { score: sanitizeScore(evaluateForSideToMove(position)), pv: [] };
	}

	const inCheck = isKingInCheck(position, position.sideToMove);
	if (
		state.useNullMovePruning &&
		allowNullMove &&
		depth >= 3 &&
		!inCheck &&
		hasNonPawnMaterial(position, position.sideToMove)
	) {
		const nullPosition = makeNullMove(position);
		const reduction = depth >= 5 ? 3 : 2;
		const nullResult = negamax(
			nullPosition,
			Math.max(0, depth - 1 - reduction),
			-beta,
			-beta + 1,
			state,
			ply + 1,
			false,
			null,
		);
		const nullScore = sanitizeScore(-nullResult.score);
		if (nullScore > alpha) alpha = nullScore;
		if (alpha >= beta) return { score: sanitizeScore(alpha), pv: [] };
	}

	const legalMoves = generateLegalMoves(position);
	if (legalMoves.length === 0) {
		if (isKingInCheck(position, position.sideToMove)) {
			return { score: -MATE_SCORE + ply, pv: [] };
		}
		return { score: 0, pv: [] };
	}

	const ttMoveUci = ttEntry?.bestMoveUci ?? null;
	const ordered = orderMoves(
		position,
		legalMoves,
		state,
		ply,
		ttMoveUci,
		prevMoveUci,
	);

	let bestScore = -SEARCH_SCORE_BOUND;
	let bestMoveUci = null;
	let bestPv = [];
	const alphaOrig = alpha;

	for (const [index, move] of ordered.entries()) {
		const next = applyMove(position, move);
		const moveUci = moveToUci(move);
		const givesCheck = isKingInCheck(next, next.sideToMove);
		const extension =
			state.checkExtensions && givesCheck && ply < state.maxExtensionPly
				? 1
				: 0;
		const childDepth = Math.max(0, depth - 1 + extension);
		const tryLmr =
			state.useLmr &&
			depth >= 3 &&
			index >= 3 &&
			!inCheck &&
			isQuietMove(move) &&
			extension === 0;

		let child;
		let score;
		if (tryLmr) {
			child = negamax(
				next,
				Math.max(0, childDepth - 1),
				-alpha - 1,
				-alpha,
				state,
				ply + 1,
				true,
				moveUci,
			);
			score = sanitizeScore(-child.score);
			if (score > alpha && score < beta) {
				child = negamax(
					next,
					childDepth,
					-beta,
					-alpha,
					state,
					ply + 1,
					true,
					moveUci,
				);
				score = sanitizeScore(-child.score);
			}
		} else if (!state.usePvs || index === 0) {
			child = negamax(
				next,
				childDepth,
				-beta,
				-alpha,
				state,
				ply + 1,
				true,
				moveUci,
			);
			score = sanitizeScore(-child.score);
		} else {
			child = negamax(
				next,
				childDepth,
				-alpha - 1,
				-alpha,
				state,
				ply + 1,
				true,
				moveUci,
			);
			score = sanitizeScore(-child.score);
			if (score > alpha) {
				child = negamax(
					next,
					childDepth,
					-beta,
					-alpha,
					state,
					ply + 1,
					true,
					moveUci,
				);
				score = sanitizeScore(-child.score);
			}
		}

		if (score > bestScore) {
			bestScore = score;
			bestMoveUci = moveUci;
			bestPv = [bestMoveUci, ...child.pv];
		}

		if (score > alpha) alpha = score;
		if (alpha >= beta) {
			if (isQuietMove(move)) {
				updateKillers(state, ply, moveUci);
				updateHistory(state, moveUci, depth);
				if (prevMoveUci) state.counterMoves.set(prevMoveUci, moveUci);
			}
			break;
		}

		if (isHardTimeExceeded(state)) break;
	}

	const flag =
		bestScore <= alphaOrig ? "UPPER" : bestScore >= beta ? "LOWER" : "EXACT";
	state.tt.set(fenKey, position.sideToMove, {
		depth,
		score: sanitizeScore(bestScore),
		flag,
		bestMoveUci,
	});

	return { score: sanitizeScore(bestScore), pv: bestPv };
};

const uciToMove = (position, uci) => {
	const legalMoves = generateLegalMoves(position);
	return legalMoves.find((move) => moveToUci(move) === uci) ?? null;
};

export { DEFAULT_WEIGHTS, evaluateForSideToMove, evaluatePosition };

export const searchBestMove = (position, options = {}) => {
	const depthInput = Number(options.depth);
	const maxNodesInput = Number(options.maxNodes);
	const maxTimeInput = Number(options.maxTimeMs);
	const softTimeInput = Number(options.softTimeMs);
	const hardTimeInput = Number(options.hardTimeMs);
	const depth = Number.isInteger(depthInput) ? depthInput : 3;
	const maxNodes = Number.isInteger(maxNodesInput) ? maxNodesInput : 200000;
	const maxTimeMs = Number.isFinite(maxTimeInput)
		? Math.max(0, maxTimeInput)
		: 0;
	const softTimeMs = Number.isFinite(softTimeInput)
		? Math.max(0, softTimeInput)
		: maxTimeMs;
	const hardTimeMs = Number.isFinite(hardTimeInput)
		? Math.max(0, hardTimeInput)
		: softTimeMs > 0
			? Math.round(softTimeMs * 1.35)
			: maxTimeMs;
	const iterativeDeepening = options.iterativeDeepening !== false;
	const aspirationWindows = options.aspirationWindows !== false;
	const usePvs = options.usePvs !== false;
	const useNullMovePruning = options.useNullMovePruning !== false;
	const useLmr = options.useLmr !== false;
	const checkExtensions = options.checkExtensions !== false;
	const tt = options.tt ?? createTranspositionTable(options.ttSize ?? 30000);

	const state = {
		tt,
		nodes: 0,
		maxNodes,
		startTime: Date.now(),
		softTimeMs,
		hardTimeMs,
		killerMoves: [],
		historyHeuristic: new Map(),
		counterMoves: new Map(),
		usePvs,
		useNullMovePruning,
		useLmr,
		checkExtensions,
		maxExtensionPly: 12,
	};

	// Fast tactical guardrail: always prefer immediate checkmate at root.
	const rootMoves = generateLegalMoves(position);
	for (const move of rootMoves) {
		const next = applyMove(position, move);
		const status = getGameStatus(next);
		if (status.terminal && status.reason === "checkmate") {
			const winner = status.winner;
			if (winner === position.sideToMove) {
				const moveUci = moveToUci(move);
				return {
					move,
					moveUci,
					score: MATE_SCORE - 1,
					pv: [moveUci],
					nodes: 0,
					searchedDepth: 1,
					tt,
				};
			}
		}
	}

	let result = {
		score: sanitizeScore(evaluateForSideToMove(position)),
		pv: [],
	};
	let searchedDepth = 0;

	if (depth <= 0 || !iterativeDeepening) {
		result = negamax(
			position,
			Math.max(depth, 0),
			-SEARCH_SCORE_BOUND,
			SEARCH_SCORE_BOUND,
			state,
			0,
		);
		searchedDepth = Math.max(depth, 0);
	} else {
		let previousScore = sanitizeScore(evaluateForSideToMove(position));
		for (let currentDepth = 1; currentDepth <= depth; currentDepth += 1) {
			if (state.nodes >= maxNodes) break;
			if (isSoftTimeExceeded(state)) break;

			let current;
			if (aspirationWindows && currentDepth > 1) {
				// Clamp aspiration anchor to realistic chess range so TT sentinel
				// scores don't produce degenerate ±40 windows around MAX_SAFE_INT.
				const windowAnchor = sanitizeScore(previousScore);
				const window = 40;
				const alpha = windowAnchor - window;
				const beta = windowAnchor + window;
				current = negamax(position, currentDepth, alpha, beta, state, 0);

				if (current.score <= alpha || current.score >= beta) {
					current = negamax(
						position,
						currentDepth,
						-SEARCH_SCORE_BOUND,
						SEARCH_SCORE_BOUND,
						state,
						0,
					);
				}
			} else {
				current = negamax(
					position,
					currentDepth,
					-SEARCH_SCORE_BOUND,
					SEARCH_SCORE_BOUND,
					state,
					0,
				);
			}

			if (current.pv.length > 0 || searchedDepth === 0) {
				result = current;
				searchedDepth = currentDepth;
				// Keep previousScore for window anchor; raw value preserved so
				// callers see real score, sanitizeScore applied lazily on next iter.
				previousScore = current.score;
			}

			if (isSoftTimeExceeded(state)) break;
		}
	}

	const bestMoveUci = result.pv[0] ?? null;

	return {
		move: bestMoveUci ? uciToMove(position, bestMoveUci) : null,
		moveUci: bestMoveUci,
		score: result.score,
		pv: result.pv,
		nodes: state.nodes,
		searchedDepth,
		tt,
	};
};
