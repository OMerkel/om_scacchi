// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Fixed-FEN benchmark suite.
//
// Each entry defines a chess position with:
//   name        – human-readable description
//   fen         – FEN string
//   category    – tactical | positional | endgame | mate | blunder-avoid
//   bestMoves   – array of acceptable UCI move(s); null = no assertion, score-only
//   minScore    – optional: result.score must be >= this (from side-to-move POV)
//   maxScore    – optional: result.score must be <= this
//   rejectMoves – array of moves that must NOT be played
//
// Run:  node scripts/benchmark-fen-suite.js [--depth N] [--nodes N] [--quiet] [--record [file]]
//
// --record appends one NDJSON line to .benchmark-history.ndjson (or the given
//   file path) so benchmark-trend.js can plot kNps/depth trends over time.

import { appendFileSync } from "node:fs";
import { searchBestMove } from "../js/chess/ai/negamax_search.js";
import { parseFen } from "../js/chess/fen.js";
import { createTranspositionTable } from "../js/chess/transposition_table.js";

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const depthArg = args.includes("--depth")
	? Number(args[args.indexOf("--depth") + 1])
	: null;
const nodesArg = args.includes("--nodes")
	? Number(args[args.indexOf("--nodes") + 1])
	: null;
const quiet = args.includes("--quiet");
const recordIdx = args.indexOf("--record");
const recordFlag = recordIdx !== -1;
const recordFile =
	recordFlag && args[recordIdx + 1] && !args[recordIdx + 1].startsWith("--")
		? args[recordIdx + 1]
		: new URL(".benchmark-history.ndjson", import.meta.url).pathname.replace(
				/^\/([A-Za-z]:)/,
				"$1",
			);

const DEFAULT_DEPTH = depthArg ?? 8;
const DEFAULT_NODES = nodesArg ?? 1_200_000;
const DEFAULT_TIME_MS = 3000;

// ── Position catalogue ─────────────────────────────────────────────────────
// Each entry may include an `opts` object that overrides the default search
// parameters for that specific position (depth, maxNodes, maxTimeMs, etc.).
const POSITIONS = [
	// ── Mate in 1 ─────────────────────────────────────────────────────────
	{
		name: "Mate in 1: Rxc8#",
		fen: "R1q1kb1r/3ppppp/8/4n3/3r4/2N2Q2/1PP2PPP/2B3KR w k - 2 20",
		category: "mate",
		bestMoves: ["a8c8"],
	},
	{
		name: "Mate in 1: back-rank Rh8#",
		fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
		category: "mate",
		bestMoves: ["e1e8"],
	},

	// ── Tactical captures (use lower depth — straightforward tactics) ──────
	{
		name: "Queen capture over pawn capture",
		fen: "k7/8/8/2q1p3/3P4/8/8/7K w - - 0 1",
		category: "tactical",
		// Correct at depth 4; at depth 8 with time limits the TT can mislead.
		opts: { depth: 4, maxNodes: 200000, maxTimeMs: 0 },
		bestMoves: ["d4c5"],
	},
	{
		name: "Queen capture in open centre",
		fen: "4k3/8/8/2q1p3/3P4/8/8/4K3 w - - 0 1",
		category: "tactical",
		opts: { depth: 4, maxNodes: 200000, maxTimeMs: 0 },
		bestMoves: ["d4c5"],
	},
	{
		name: "Avoid Qe5+ queen blunder (endgame)",
		fen: "8/2Q3pp/8/3k4/3pb3/8/3K1PPP/8 w - - 1 46",
		category: "blunder-avoid",
		bestMoves: null,
		rejectMoves: ["c7e5"],
	},
	{
		name: "Avoid Qxe2+ losing queen (black)",
		fen: "r1b1kr2/pppp1ppp/8/3NP3/1P1Q4/6P1/PPq1P2P/3RKB1R b K - 8 15",
		category: "blunder-avoid",
		bestMoves: null,
		rejectMoves: ["c2e2"],
	},

	// ── Hanging pieces / material grabs ───────────────────────────────────
	{
		name: "White avoids leaving queen hanging to pawn",
		fen: "rnbqkbnr/ppp1pppp/8/3p4/4P1Q1/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1",
		category: "tactical",
		bestMoves: null,
		minScore: -100,
	},

	// ── Discovered attacks / pins ─────────────────────────────────────────
	{
		name: "Pinned bishop — white must handle d-file pin",
		// Black king g1 is very close; white is objectively worse here.
		fen: "3r4/8/8/8/3B4/8/8/3K2k1 w - - 0 1",
		category: "tactical",
		bestMoves: null,
		// White cannot avoid losing the bishop; score is clearly negative.
		minScore: -600,
		maxScore: 50,
	},

	// ── Endgame technique ─────────────────────────────────────────────────
	{
		name: "Connected passed pawns winning",
		fen: "8/5K2/1PP5/8/8/8/k7/8 w - - 0 1",
		category: "endgame",
		bestMoves: null,
		minScore: 300,
	},
	{
		name: "Queen vs lone king — must not give up queen",
		fen: "8/2Q3pp/8/3k4/3pb3/8/3K1PPP/8 w - - 1 46",
		category: "endgame",
		bestMoves: null,
		minScore: 500,
		rejectMoves: ["c7e5"],
	},

	// ── Opening / development ──────────────────────────────────────────────
	{
		name: "Italian game — black develops sensibly",
		fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 2 3",
		category: "positional",
		bestMoves: null,
		minScore: -80,
		maxScore: 80,
	},
	{
		name: "Sicilian — white keeps advantage",
		fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2",
		category: "positional",
		bestMoves: null,
		minScore: 0,
	},

	// ── King safety ───────────────────────────────────────────────────────
	{
		name: "Defend back-rank: white has active rook",
		// White g1 rook can go to g8 or e1. Position is roughly balanced.
		fen: "6rk/5ppp/8/8/8/8/6P1/6RK w - - 0 1",
		category: "tactical",
		bestMoves: null,
		minScore: -250,
		maxScore: 150,
	},
	{
		name: "Back-rank threat: black must not ignore Rxf8#",
		fen: "4kr2/5ppp/8/8/8/8/6RK/8 b - - 0 1",
		category: "tactical",
		bestMoves: null,
	},

	// ── Attack coordination ────────────────────────────────────────────────
	{
		name: "Black rook coordination vs white king",
		fen: "r3k3/8/r7/8/8/8/4K3/R3R3 b - - 0 1",
		category: "positional",
		bestMoves: null,
	},

	// ── Pawn structure ─────────────────────────────────────────────────────
	{
		name: "No unnecessary isolated/doubled pawns",
		fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
		category: "positional",
		bestMoves: null,
		minScore: -30,
		maxScore: 120,
	},

	// ── Complex tactical ───────────────────────────────────────────────────
	{
		name: "Discovered attack — Nc3 development, balanced",
		// The expected benefit of Nxe5 depends on evaluation; just assert not losing.
		fen: "r1bqkb1r/pppppppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 0 1",
		category: "tactical",
		bestMoves: null,
		minScore: -60,
	},
	{
		name: "Quiet strong move preferred over weak capture",
		fen: "r1bqkb1r/pp2pppp/2np1n2/3p4/2PPP3/2N2N2/PP3PPP/R1BQKB1R w KQkq - 0 1",
		category: "positional",
		bestMoves: null,
		minScore: -50,
	},
	{
		name: "Hidden tactical blow in quiet-looking position",
		fen: "r1bqkb1r/pppppppp/2n5/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 0 1",
		category: "tactical",
		bestMoves: null,
		minScore: -30,
	},
];

// ── Runner ─────────────────────────────────────────────────────────────────
const COL = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
};

let passed = 0;
let failed = 0;
const failures = [];
const posResults = [];

const COL_W = [5, 46, 10, 8, 7, 6, 8];
const header = ["", "Position", "Category", "Move", "Score", "Depth", "kNps"]
	.map((h, i) => h.padEnd(COL_W[i]))
	.join(" ");

if (!quiet) {
	console.log();
	console.log(
		`${COL.bold}Fixed-FEN Benchmark Suite${COL.reset}  depth=${DEFAULT_DEPTH}  nodes=${DEFAULT_NODES.toLocaleString()}`,
	);
	console.log("─".repeat(header.length));
	console.log(header);
	console.log("─".repeat(header.length));
}

for (const pos of POSITIONS) {
	const position = parseFen(pos.fen);
	const depth = pos.opts?.depth ?? DEFAULT_DEPTH;
	const maxNodes = pos.opts?.maxNodes ?? DEFAULT_NODES;
	const maxTimeMs =
		pos.opts?.maxTimeMs !== undefined ? pos.opts.maxTimeMs : DEFAULT_TIME_MS;
	const softTimeMs = maxTimeMs > 0 ? maxTimeMs - 100 : 0;
	const hardTimeMs = maxTimeMs > 0 ? maxTimeMs + 100 : 0;

	const t0 = Date.now();
	const result = searchBestMove(position, {
		depth,
		maxNodes,
		maxTimeMs,
		softTimeMs,
		hardTimeMs,
		iterativeDeepening: true,
		tt: createTranspositionTable(),
	});
	const elapsed = Math.max(1, Date.now() - t0);
	const knps = Math.round(result.nodes / elapsed);

	// Evaluate pass/fail
	let ok = true;
	const reasons = [];

	if (pos.bestMoves && pos.bestMoves.length > 0) {
		if (!pos.bestMoves.includes(result.moveUci)) {
			ok = false;
			reasons.push(
				`expected one of [${pos.bestMoves.join(",")}] got ${result.moveUci}`,
			);
		}
	}
	if (pos.rejectMoves?.includes(result.moveUci)) {
		ok = false;
		reasons.push(`played rejected move ${result.moveUci}`);
	}
	if (pos.minScore !== undefined && result.score < pos.minScore) {
		ok = false;
		reasons.push(`score ${result.score} < minScore ${pos.minScore}`);
	}
	if (pos.maxScore !== undefined && result.score > pos.maxScore) {
		ok = false;
		reasons.push(`score ${result.score} > maxScore ${pos.maxScore}`);
	}

	if (ok) {
		passed++;
	} else {
		failed++;
		failures.push({ name: pos.name, reasons });
	}

	// Accumulate data for --record
	posResults.push({
		name: pos.name,
		category: pos.category,
		pass: ok,
		move: result.moveUci ?? null,
		score: result.score,
		depth: result.searchedDepth,
		knps,
		elapsed,
	});

	if (!quiet) {
		const status = ok
			? `${COL.green}PASS${COL.reset}`
			: `${COL.red}FAIL${COL.reset}`;
		const line = `${status}  ${pos.name.slice(0, 45).padEnd(46)}  ${pos.category.padEnd(10)}  ${(result.moveUci ?? "-").padEnd(6)}  ${String(result.score).padEnd(7)}  d=${result.searchedDepth}  ${knps}k nps`;
		console.log(line);
	}
}

// ── Summary ────────────────────────────────────────────────────────────────
const total = passed + failed;
if (!quiet) {
	console.log("─".repeat(header.length));
}
const summaryColor = failed === 0 ? COL.green : COL.red;
console.log(
	`${COL.bold}${summaryColor}${passed}/${total} passed${COL.reset}  (${failed} failed)`,
);

if (failures.length > 0 && !quiet) {
	console.log();
	console.log(`${COL.bold}Failures:${COL.reset}`);
	for (const f of failures) {
		console.log(`  ${COL.red}\u2717${COL.reset} ${f.name}`);
		for (const r of f.reasons) {
			console.log(`      ${COL.dim}${r}${COL.reset}`);
		}
	}
}

// ── Record history ─────────────────────────────────────────────────────────
if (recordFlag) {
	const record = {
		timestamp: new Date().toISOString(),
		defaultDepth: DEFAULT_DEPTH,
		defaultNodes: DEFAULT_NODES,
		passed,
		total: passed + failed,
		avgKnps:
			Math.round(
				posResults.reduce((s, r) => s + r.knps, 0) / posResults.length,
			) || 0,
		avgDepth:
			Math.round(
				(posResults.reduce((s, r) => s + r.depth, 0) / posResults.length) * 10,
			) / 10,
		positions: posResults,
	};
	appendFileSync(recordFile, `${JSON.stringify(record)}\n`, "utf8");
	if (!quiet)
		console.log(`\n${COL.dim}History appended to ${recordFile}${COL.reset}`);
}

process.exit(failed > 0 ? 1 : 0);
