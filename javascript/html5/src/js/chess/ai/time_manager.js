// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Dynamic time allocation for the chess AI.
//
// Given a base time budget (from the difficulty setting) and the current
// position, computes adjusted softTimeMs / hardTimeMs values that let the
// engine spend more time on complex or critical positions and less on simple
// or clearly decided ones.
//
// Factors considered:
//   1. Game phase  – opening (book likely), middlegame, endgame
//   2. Legal move count – many moves → complex → more time
//   3. Check / in-check – urgent → full time; in check → slightly more
//   4. Material imbalance – large imbalance → position may be decided → less
//   5. Repetition pressure – position seen before → slightly more time
//      to find alternatives
//
// The output is a multiplier in [MIN_FACTOR, MAX_FACTOR] applied to baseTimeMs.
// softTimeMs = baseTimeMs * factor (capped); hardTimeMs = soft + overhead.

import { generateLegalMoves } from "../move_generator.js";
import { isKingInCheck } from "../rules.js";
import { pieceType } from "../types.js";

// ── Constants ──────────────────────────────────────────────────────────────

// Clamp multiplier so the engine never spends less than 40% or more than
// 200% of the base time budget on a single move.
const MIN_FACTOR = 0.4;
const MAX_FACTOR = 2.0;

// Rough piece values for imbalance detection (centipawns).
const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// ── Helpers ────────────────────────────────────────────────────────────────

const countMaterial = (position) => {
	let white = 0;
	let black = 0;
	for (const rank of position.board) {
		for (const piece of rank) {
			if (!piece) continue;
			const val = PIECE_VAL[pieceType(piece)] ?? 0;
			if (piece === piece.toUpperCase()) white += val;
			else black += val;
		}
	}
	return { white, black };
};

/**
 * Estimate game phase.
 * Returns "opening" | "middlegame" | "endgame".
 * - Opening:    total material > 60 (both sides nearly full) AND move ≤ 10
 * - Endgame:    total material ≤ 20 (queens + pieces mostly gone)
 * - Middlegame: everything else
 */
const gamePhase = (position, fullmoveNumber = 1) => {
	const { white, black } = countMaterial(position);
	const total = white + black;
	if (total <= 20) return "endgame";
	if (total > 58 && fullmoveNumber <= 10) return "opening";
	return "middlegame";
};

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Compute dynamic search time limits for a position.
 *
 * @param {Object} position      - Chess position object
 * @param {number} baseTimeMs    - Base time from difficulty setting (ms)
 * @param {number} overheadMs    - Communication overhead to subtract (ms)
 * @param {boolean} seenBefore   - True if this position appeared in game history
 * @returns {{ softTimeMs: number, hardTimeMs: number, factor: number }}
 */
export const computeTimeLimits = (
	position,
	baseTimeMs,
	overheadMs = 30,
	seenBefore = false,
) => {
	const legalMoves = generateLegalMoves(position);
	const moveCount = legalMoves.length;
	const inCheck = isKingInCheck(position, position.sideToMove);
	const phase = gamePhase(position, position.fullmoveNumber ?? 1);
	const { white, black } = countMaterial(position);

	let factor = 1.0;

	// ── Phase adjustment ──────────────────────────────────────────────────
	// Opening: book might cover it, use less time.
	// Endgame: fewer moves but precision matters, use slightly more.
	if (phase === "opening") {
		factor *= 0.7;
	} else if (phase === "endgame") {
		factor *= 1.2;
	}

	// ── Legal-move complexity ─────────────────────────────────────────────
	// Many legal moves → harder to find the right one.
	// Baseline is ~28 moves (typical middlegame branching factor).
	if (moveCount >= 35) {
		factor *= 1.3; // rich tactical choice
	} else if (moveCount >= 28) {
		factor *= 1.1;
	} else if (moveCount <= 8) {
		factor *= 0.8; // forced / nearly forced
	} else if (moveCount <= 3) {
		factor *= 0.5; // almost forced
	}

	// ── Check urgency ─────────────────────────────────────────────────────
	// When we are in check we must respond → give a little extra time to
	// find the best defensive move.
	if (inCheck) {
		factor *= 1.25;
	}

	// ── Material imbalance ────────────────────────────────────────────────
	// Large advantage → position may convert itself; save time.
	// Large disadvantage → need to fight; use full time.
	const imbalance = Math.abs(white - black);
	if (imbalance >= 12) {
		// Winning or losing badly (≥ rook ahead/behind)
		factor *= white > black ? 0.75 : 1.15;
	} else if (imbalance >= 6) {
		// Piece-sized imbalance
		factor *= white > black ? 0.9 : 1.05;
	}

	// ── Repetition pressure ───────────────────────────────────────────────
	// If the position was seen before we need more time to find an
	// alternative that avoids the draw.
	if (seenBefore) {
		factor *= 1.2;
	}

	// ── Clamp and apply ───────────────────────────────────────────────────
	factor = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, factor));

	const adjustedBase = Math.round(baseTimeMs * factor);
	const softTimeMs = Math.max(20, adjustedBase - overheadMs);
	const hardTimeMs = Math.max(softTimeMs + 10, adjustedBase + overheadMs);

	return { softTimeMs, hardTimeMs, factor };
};
