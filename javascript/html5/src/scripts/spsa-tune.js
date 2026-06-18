// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// SPSA (Simultaneous Perturbation Stochastic Approximation) evaluation tuner.
//
// Tunes the scalar weights in js/chess/ai/eval_weights.js by running
// perturbed evaluations against a fixed corpus of positions and measuring
// which perturbation direction improves win/draw outcomes.
//
// Algorithm (Spall 1992):
//   For each iteration:
//     1. Sample a ±1 Bernoulli random vector Δ (one per weight).
//     2. Evaluate the corpus with weights (θ + c·Δ) and (θ - c·Δ).
//     3. Approximate gradient: ĝ = (f₊ - f₋) / (2c·Δ).
//     4. Update: θ ← θ - a/(A+k)^α · ĝ.
//   Repeat for --iterations steps, writing improved weights each time
//   they produce a higher corpus score.
//
// Usage:
//   node scripts/spsa-tune.js [--iterations N] [--depth D] [--nodes N] [--quiet]
//
// After tuning, writes updated weights to:
//   js/chess/ai/eval_weights.js
// and saves a backup of the original.

import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	DEFAULT_WEIGHTS,
	evaluateForSideToMove,
} from "../js/chess/ai/negamax_search.js";
import { parseFen } from "../js/chess/fen.js";
import { generateLegalMoves, moveToUci } from "../js/chess/move_generator.js";
import { applyMove } from "../js/chess/rules.js";

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const cli = (flag, def) => {
	const idx = args.indexOf(flag);
	return idx !== -1 ? Number(args[idx + 1]) : def;
};
const ITERATIONS = cli("--iterations", 120);
const QUIET = args.includes("--quiet");

// ── SPSA hyper-parameters ──────────────────────────────────────────────────
const A = 10; // stability constant (larger = more conservative)
const ALPHA = 0.602; // step-size decay exponent (standard)
const GAMMA = 0.101; // perturbation decay exponent (standard)
const a = 10; // initial step-size numerator
const c0 = 6; // initial perturbation magnitude (centipawns)

// ── Tuning corpus ──────────────────────────────────────────────────────────
// Each position includes:
//   bestMove   – the move we want the eval to prefer (from current side)
//   rejectMove – the move we want the eval to penalise
//   sideBonus  – which side we're evaluating for (fallback positional bonus)
// The tuner rewards W when bestMove scores higher than rejectMove after 1 ply.
const CORPUS = [
	// Tactical captures
	{
		fen: "k7/8/8/2q1p3/3P4/8/8/7K w - - 0 1",
		bestMove: "d4c5",
		rejectMove: "h1g2",
		sideBonus: "w",
	},
	{
		fen: "4k3/8/8/2q1p3/3P4/8/8/4K3 w - - 0 1",
		bestMove: "d4c5",
		rejectMove: "e1d2",
		sideBonus: "w",
	},

	// Queen blunder avoidance
	{
		fen: "8/2Q3pp/8/3k4/3pb3/8/3K1PPP/8 w - - 1 46",
		rejectMove: "c7e5",
		sideBonus: "w",
	},
	{
		fen: "r1b1kr2/pppp1ppp/8/3NP3/1P1Q4/6P1/PPq1P2P/3RKB1R b K - 8 15",
		rejectMove: "c2e2",
		sideBonus: "b",
	},

	// Passing pawns
	{
		fen: "8/5K2/1PP5/8/8/8/k7/8 w - - 0 1",
		bestMove: "c6c7",
		sideBonus: "w",
	},

	// King safety: castled king better
	{
		fen: "r1bq1rk1/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 6 5",
		sideBonus: "w",
	},

	// Rook on open file
	{
		fen: "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1",
		bestMove: "a1a8",
		rejectMove: "a1a2",
		sideBonus: "w",
	},

	// Isolated pawn penalty (don't create isolation)
	{
		fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
		sideBonus: "w",
	},

	// Bishop pair advantage: prefer keeping both bishops
	{
		fen: "r1bq1rk1/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 0 1",
		sideBonus: "w",
	},

	// Opening development
	{
		fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		bestMove: "g8f6",
		sideBonus: "b",
	},
	{
		fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2",
		bestMove: "f1c4",
		sideBonus: "w",
	},

	// Endgame: king centralisation
	{
		fen: "8/8/3k4/8/3K4/8/8/8 w - - 0 1",
		bestMove: "d4e5",
		rejectMove: "d4a1",
		sideBonus: "w",
	},

	// Passed pawn advancement
	{
		fen: "8/8/3k4/3PP3/8/8/8/3K4 w - - 0 1",
		bestMove: "e5e6",
		rejectMove: "d1c2",
		sideBonus: "w",
	},

	// Back-rank: don't allow back rank mates
	{
		fen: "6rk/5ppp/8/8/8/8/5PPP/6RK w - - 0 1",
		sideBonus: "w",
	},

	// Mobility: active pieces
	{
		fen: "r1bq1rk1/pp2pppp/2np1n2/3p4/2PPP3/2N2N2/PP3PPP/R1BQKB1R w KQkq - 0 1",
		sideBonus: "w",
	},
];

// ── Score corpus with given weights ───────────────────────────────────────
// We use a relative quality measure: for each position, compare the evaluation
// of the best known move vs. a reject move (or vs. random move from root).
// Higher score = the weights correctly rank the better move higher.
// This prevents the trivial "inflate everything to max" solution.
//
// For each position we score:
//   +2  if the engine (with W) prefers bestMove over rejectMove
//   +1  if score(bestMove) > score(randomMove)
//   -1  otherwise
//
// We use a very shallow 1-ply evaluation (apply move, eval leaf) to stay fast.

const applyMoveAndEval = (position, moveUci, W) => {
	const legalMoves = generateLegalMoves(position);
	const move = legalMoves.find((m) => moveToUci(m) === moveUci);
	if (!move) return null;
	const next = applyMove(position, move);
	// Score from moving side's perspective (negated for opponent)
	return -evaluateForSideToMove(next, W);
};

const scoreCorpusEvalOnly = (W) => {
	let total = 0;
	for (const pos of CORPUS) {
		const position = parseFen(pos.fen);
		if (!pos.bestMove && !pos.rejectMove) {
			// No assertion: contribute small positional score to help gradient
			total +=
				evaluateForSideToMove({ ...position, sideToMove: pos.sideBonus }, W) *
				0.01;
			continue;
		}

		// Score the preferred move
		const bestScore = pos.bestMove
			? applyMoveAndEval(position, pos.bestMove, W)
			: null;
		const rejectScore = pos.rejectMove
			? applyMoveAndEval(position, pos.rejectMove, W)
			: null;

		if (bestScore !== null && rejectScore !== null) {
			// Reward if preferred move scores strictly higher
			const margin = bestScore - rejectScore;
			total += Math.tanh(margin / 50) * 100;
		} else if (bestScore !== null) {
			// Just reward if best move has positive eval
			total += Math.tanh(bestScore / 100) * 50;
		} else if (rejectScore !== null) {
			// Reward if reject move has negative eval
			total += Math.tanh(-rejectScore / 100) * 50;
		}
	}
	return total;
};

// ── SPSA main loop ─────────────────────────────────────────────────────────
const weightKeys = Object.keys(DEFAULT_WEIGHTS);
const n = weightKeys.length;

const theta = { ...DEFAULT_WEIGHTS };
let bestScore = scoreCorpusEvalOnly(theta);
let bestTheta = { ...theta };

const C = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
};

if (!QUIET) {
	console.log();
	console.log(
		`${C.bold}SPSA Evaluation Weight Tuner${C.reset}  iterations=${ITERATIONS}  params=${n}`,
	);
	console.log(`Initial corpus score: ${bestScore.toFixed(1)}`);
	console.log("─".repeat(60));
}

let improved = 0;
for (let k = 1; k <= ITERATIONS; k += 1) {
	// Decay schedules
	const ak = a / (A + k) ** ALPHA;
	const ck = c0 / k ** GAMMA;

	// Random ±1 Bernoulli perturbation vector
	const delta = weightKeys.map(() => (Math.random() < 0.5 ? 1 : -1));

	// Perturbed weight sets θ± = θ ± c·Δ
	const thetaPlus = {};
	const thetaMinus = {};
	for (let i = 0; i < n; i += 1) {
		const key = weightKeys[i];
		thetaPlus[key] = Math.round(theta[key] + ck * delta[i]);
		thetaMinus[key] = Math.round(theta[key] - ck * delta[i]);
	}

	const scorePlus = scoreCorpusEvalOnly(thetaPlus);
	const scoreMinus = scoreCorpusEvalOnly(thetaMinus);

	// Gradient estimate
	const diff = scorePlus - scoreMinus;

	// Update each parameter
	for (let i = 0; i < n; i += 1) {
		const key = weightKeys[i];
		const grad = diff / (2 * ck * delta[i]);
		theta[key] = Math.round(theta[key] + ak * grad);
		// Clamp to sensible range (0..500) to prevent divergence
		theta[key] = Math.max(0, Math.min(500, theta[key]));
	}

	const currentScore = scoreCorpusEvalOnly(theta);
	if (currentScore > bestScore) {
		bestScore = currentScore;
		bestTheta = { ...theta };
		improved += 1;
		if (!QUIET) {
			process.stdout.write(
				`\r${C.green}iter ${k.toString().padStart(4)}/${ITERATIONS}  score=${currentScore.toFixed(1).padStart(8)}  improvements=${improved}${C.reset}`,
			);
		}
	} else if (!QUIET && k % 20 === 0) {
		process.stdout.write(
			`\r${C.dim}iter ${k.toString().padStart(4)}/${ITERATIONS}  score=${currentScore.toFixed(1).padStart(8)}  improvements=${improved}${C.reset}`,
		);
	}
}

if (!QUIET) {
	console.log();
	console.log("─".repeat(60));
	console.log(
		`${C.bold}Final best score: ${bestScore.toFixed(1)}${C.reset}  (${improved} improvements)`,
	);
	console.log();
}

// ── Print weight delta table ───────────────────────────────────────────────
if (!QUIET) {
	console.log(`${C.bold}Weight changes:${C.reset}`);
	console.log(
		`${"Parameter".padEnd(34)} ${"Before".padStart(7)} ${"After".padStart(7)} ${"Delta".padStart(7)}`,
	);
	console.log("─".repeat(58));
	for (const key of weightKeys) {
		const before = DEFAULT_WEIGHTS[key];
		const after = bestTheta[key];
		const delta = after - before;
		const color = delta > 0 ? C.green : delta < 0 ? C.yellow : C.dim;
		console.log(
			`${key.padEnd(34)} ${String(before).padStart(7)} ${(color + String(after) + C.reset).padStart(7 + color.length + C.reset.length)} ${(delta >= 0 ? "+" : "") + String(delta).padStart(6)}`,
		);
	}
	console.log();
}

// ── Write updated eval_weights.js ─────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const weightsPath = join(__dirname, "../js/chess/ai/eval_weights.js");
const backupPath = join(__dirname, "../js/chess/ai/eval_weights.js.bak");

// Backup original
copyFileSync(weightsPath, backupPath);

// Generate new file content
const lines = [
	"// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.",
	"// SPDX-License-Identifier: MIT",
	"//",
	"// Default scalar evaluation weights.",
	`// Last tuned: ${new Date().toISOString()}`,
	"//",
	"// Generated by scripts/spsa-tune.js — do not edit by hand.",
	"// To restore original weights: cp js/chess/ai/eval_weights.js.bak js/chess/ai/eval_weights.js",
	"",
	"export const DEFAULT_WEIGHTS = Object.freeze({",
];

const groupComments = {
	bishopPairBonus: "// ── Bishop pair",
	rookOpenFileBonus: "// ── Rook files",
	passedPawnBase: "// ── Passed pawns",
	kingSafetyPawnShield: "// ── King safety",
	isolatedPawnPenalty: "// ── Pawn structure",
	connectedPassersBonus: "// ── Connected passers",
	pinnedMinorPenalty: "// ── Pins",
	backRankWeaknessPenalty: "// ── Back-rank weakness",
	coordinationBonusPerAttacker: "// ── Attack coordination",
	mateThreatPenaltyPerThreat: "// ── Mate threat detection",
	mobilityBonusPerMove: "// ── Mobility",
	checkPressureBonus: "// ── Check pressure",
};

for (const key of weightKeys) {
	if (groupComments[key]) {
		lines.push(`\t${groupComments[key]}`);
	}
	lines.push(`\t${key}: ${bestTheta[key]},`);
}

lines.push("});");
lines.push("");

writeFileSync(weightsPath, lines.join("\n"), "utf8");

if (!QUIET) {
	console.log(`${C.green}✓${C.reset} Weights written to ${weightsPath}`);
	console.log(`${C.dim}  Original backed up to ${backupPath}${C.reset}`);
}

// ── Quick sanity: verify tests still pass by running eval on known positions ─
const sanityPositions = [
	{
		fen: "R1q1kb1r/3ppppp/8/4n3/3r4/2N2Q2/1PP2PPP/2B3KR w k - 2 20",
		expectSign: 1,
		label: "Rxc8# (white winning)",
	},
	{
		fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		expectSign: 0,
		label: "Italian game (balanced)",
	},
];

let sanityOk = true;
if (!QUIET) console.log();
for (const s of sanityPositions) {
	const pos = parseFen(s.fen);
	const score = evaluateForSideToMove(pos, bestTheta);
	const ok =
		s.expectSign === 0
			? Math.abs(score) < 300
			: s.expectSign > 0
				? score > 0
				: score < 0;
	if (!ok) sanityOk = false;
	if (!QUIET) {
		const marker = ok ? `${C.green}OK${C.reset}` : `${C.yellow}WARN${C.reset}`;
		console.log(`  ${marker}  ${s.label}: ${score}`);
	}
}

if (!sanityOk && !QUIET) {
	console.log(
		`\n${C.yellow}⚠ Sanity checks warn — verify tests with: npm test${C.reset}`,
	);
} else if (!QUIET) {
	console.log(`\n${C.green}✓ Sanity checks passed${C.reset}`);
	console.log("Run npm test to verify the full suite.");
}
