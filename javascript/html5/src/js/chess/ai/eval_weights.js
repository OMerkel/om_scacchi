// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Default scalar evaluation weights.
//
// All magic numbers from negamax_search.js that can be tuned independently
// are listed here as named constants.  The SPSA tuner (scripts/spsa-tune.js)
// reads this file, perturbs individual weights, and writes an improved copy.
//
// Import with:
//   import { DEFAULT_WEIGHTS } from "./eval_weights.js";
// or, inside the search, receive weights as a parameter so tests/tuner can
// substitute alternatives without touching global state.

export const DEFAULT_WEIGHTS = Object.freeze({
	// ── Bishop pair ──────────────────────────────────────────────────────
	bishopPairBonus: 28,

	// ── Rook files ───────────────────────────────────────────────────────
	rookOpenFileBonus: 18, // rook on fully open file (no pawn)
	rookSemiOpenFileBonus: 10, // rook on semi-open file (no own pawn)

	// ── Passed pawns ─────────────────────────────────────────────────────
	passedPawnBase: 8, // base bonus per passed pawn
	passedPawnAdvancement: 5, // extra per rank of advancement

	// ── King safety ───────────────────────────────────────────────────────
	kingSafetyPawnShield: 9, // per pawn in king shield

	// ── Pawn structure ────────────────────────────────────────────────────
	isolatedPawnPenalty: 12, // penalty for each isolated pawn
	doubledPawnPenalty: 8, // penalty for each doubled pawn

	// ── Connected passers ─────────────────────────────────────────────────
	connectedPassersBonus: 25, // bonus when two passed pawns are adjacent

	// ── Pins ──────────────────────────────────────────────────────────────
	pinnedMinorPenalty: 15, // penalty for pinned minor piece
	pinnedRookPenalty: 25, // penalty for pinned rook
	pinnedQueenPenalty: 40, // penalty for pinned queen

	// ── Back-rank weakness ────────────────────────────────────────────────
	backRankWeaknessPenalty: 30, // per undefended back-rank piece

	// ── Attack coordination ───────────────────────────────────────────────
	coordinationBonusPerAttacker: 15, // bonus per net attacker around enemy king

	// ── Mate threat detection ─────────────────────────────────────────────
	mateThreatPenaltyPerThreat: 50, // penalty per threatening piece when king cornered

	// ── Mobility ──────────────────────────────────────────────────────────
	mobilityBonusPerMove: 5, // centipawns per extra legal move

	// ── Check pressure ────────────────────────────────────────────────────
	checkPressureBonus: 35, // bonus when giving check
});
