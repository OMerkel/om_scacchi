// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Self-play Elo gauntlet for candidate-vs-baseline engine configs.
//
// Usage:
//   node scripts/selfplay-gauntlet.js
//   node scripts/selfplay-gauntlet.js --games 40 --depth 6 --nodes 1200000
//   node scripts/selfplay-gauntlet.js --candidate '{"useNullMovePruning":false}'
//   node scripts/selfplay-gauntlet.js --record [file]

import { appendFileSync } from "node:fs";
import { searchBestMove } from "../js/chess/ai/negamax_search.js";
import { INITIAL_FEN, parseFen } from "../js/chess/fen.js";
import { getGameStatus } from "../js/chess/game.js";
import { generateLegalMoves, moveToUci } from "../js/chess/move_generator.js";
import { applyMove } from "../js/chess/rules.js";
import { createTranspositionTable } from "../js/chess/transposition_table.js";

const DEFAULT_RECORD_FILE = new URL(
	".selfplay-history.ndjson",
	import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const DEFAULT_OPENINGS = Object.freeze([
	{
		name: "Italian main line",
		moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"],
	},
	{
		name: "Ruy Lopez",
		moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"],
	},
	{
		name: "Sicilian Open",
		moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4"],
	},
	{
		name: "French Advance",
		moves: ["e2e4", "e7e6", "d2d4", "d7d5", "e4e5", "c7c5"],
	},
	{
		name: "Caro-Kann Advance",
		moves: ["e2e4", "c7c6", "d2d4", "d7d5", "e4e5", "c8f5"],
	},
	{
		name: "Queen's Gambit Declined",
		moves: ["d2d4", "d7d5", "c2c4", "e7e6", "g1f3", "g8f6"],
	},
	{
		name: "Slav Defense",
		moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6"],
	},
	{
		name: "King's Indian setup",
		moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7"],
	},
	{
		name: "English Opening",
		moves: ["c2c4", "e7e5", "b1c3", "g8f6", "g2g3", "d7d5"],
	},
	{
		name: "London setup",
		moves: ["d2d4", "d7d5", "g1f3", "g8f6", "c1f4", "e7e6"],
	},
]);

const C = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
};

const toInt = (v, fallback) => {
	if (v === null || v === undefined || v === "") return fallback;
	const n = Number(v);
	return Number.isInteger(n) ? n : fallback;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const parseJsonObject = (raw, fallback, label) => {
	if (!raw) return fallback;
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed;
		}
	} catch {
		try {
			// Accept relaxed object syntax often produced by shell quoting,
			// e.g. {useNullMovePruning:false} or {'depth':4}.
			const normalized = String(raw)
				.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
				.replace(/'/g, '"');
			const parsedLoose = JSON.parse(normalized);
			if (
				parsedLoose &&
				typeof parsedLoose === "object" &&
				!Array.isArray(parsedLoose)
			) {
				return parsedLoose;
			}
		} catch {
			console.warn(
				`Warning: could not parse ${label} JSON, using defaults: ${raw}`,
			);
		}
	}
	return fallback;
};

const mulberry32 = (seed) => {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
};

const sampleOne = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const uciToMove = (position, uci) => {
	const legal = generateLegalMoves(position);
	return legal.find((m) => moveToUci(m) === uci) ?? null;
};

const applyOpeningLine = (position, opening, plies) => {
	let p = position;
	const applied = [];
	for (let i = 0; i < opening.moves.length && i < plies; i += 1) {
		const uci = opening.moves[i];
		const move = uciToMove(p, uci);
		if (!move) break;
		p = applyMove(p, move);
		applied.push(uci);
	}
	return { position: p, openingApplied: applied };
};

const outcomeFromStatus = (status) => {
	if (!status.terminal) {
		return { winner: null, reason: "in_progress" };
	}
	return { winner: status.winner, reason: status.reason };
};

const scorePoint = (winnerColor, candidateColor) => {
	if (!winnerColor) return 0.5;
	return winnerColor === candidateColor ? 1 : 0;
};

const scoreToElo = (score) => {
	const p = clamp(score, 0.001, 0.999);
	return -400 * Math.log10(1 / p - 1);
};

const meanAndVariance = (values) => {
	if (values.length === 0) return { mean: 0, variance: 0 };
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	if (values.length === 1) return { mean, variance: 0 };
	const sq = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
	return { mean, variance: sq / (values.length - 1) };
};

const computeConfidence = (points) => {
	const n = points.length;
	if (n === 0) {
		return {
			mean: 0,
			lo: 0,
			hi: 0,
			elo: 0,
			eloLo: 0,
			eloHi: 0,
		};
	}

	const { mean, variance } = meanAndVariance(points);
	const se = Math.sqrt(variance / n);
	const z = 1.96;
	const lo = clamp(mean - z * se, 0, 1);
	const hi = clamp(mean + z * se, 0, 1);

	return {
		mean,
		lo,
		hi,
		elo: scoreToElo(mean),
		eloLo: scoreToElo(lo),
		eloHi: scoreToElo(hi),
	};
};

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
	const idx = args.indexOf(name);
	if (idx === -1) return fallback;
	return args[idx + 1] ?? fallback;
};
const hasFlag = (name) => args.includes(name);

const games = Math.max(2, toInt(getArg("--games"), 40));
const seed = toInt(getArg("--seed"), 1);
const openingPlies = Math.max(0, toInt(getArg("--opening-plies"), 6));
const maxPlies = Math.max(20, toInt(getArg("--max-plies"), 220));
const baseDepth = Math.max(1, toInt(getArg("--depth"), 5));
const baseNodes = Math.max(10_000, toInt(getArg("--nodes"), 900_000));
const baseTimeMs = Math.max(0, toInt(getArg("--time-ms"), 0));
const quiet = hasFlag("--quiet");

const recordIdx = args.indexOf("--record");
const record = recordIdx !== -1;
const recordFile =
	record && args[recordIdx + 1] && !args[recordIdx + 1].startsWith("--")
		? args[recordIdx + 1]
		: DEFAULT_RECORD_FILE;

const openingCount = clamp(
	toInt(getArg("--openings"), DEFAULT_OPENINGS.length),
	1,
	DEFAULT_OPENINGS.length,
);
const openings = DEFAULT_OPENINGS.slice(0, openingCount);

const baselineExtra = parseJsonObject(getArg("--baseline"), {}, "--baseline");
const candidateExtra = parseJsonObject(
	getArg("--candidate"),
	{},
	"--candidate",
);

const sharedSearch = {
	depth: baseDepth,
	maxNodes: baseNodes,
	maxTimeMs: baseTimeMs,
	softTimeMs: baseTimeMs > 0 ? Math.max(1, baseTimeMs - 100) : 0,
	hardTimeMs: baseTimeMs > 0 ? baseTimeMs + 150 : 0,
	iterativeDeepening: true,
};

const baselineCfg = { ...sharedSearch, ...baselineExtra };
const candidateCfg = { ...sharedSearch, ...candidateExtra };

const totalGames = games % 2 === 0 ? games : games + 1;
const pairCount = totalGames / 2;

const rng = mulberry32(seed);

const runSingleGame = ({ gameNo, opening, candidateColor }) => {
	let position = parseFen(INITIAL_FEN);
	const openingState = applyOpeningLine(position, opening, openingPlies);
	position = openingState.position;

	const ttWhite = createTranspositionTable();
	const ttBlack = createTranspositionTable();

	let ply = 0;
	let reason = "max_plies";
	let winner = null;
	let terminal = false;

	while (ply < maxPlies) {
		const status = getGameStatus(position);
		if (status.terminal) {
			const out = outcomeFromStatus(status);
			winner = out.winner;
			reason = out.reason;
			terminal = true;
			break;
		}

		const side = position.sideToMove;
		const engineCfg = side === candidateColor ? candidateCfg : baselineCfg;
		const tt = side === "w" ? ttWhite : ttBlack;
		const result = searchBestMove(position, { ...engineCfg, tt });

		if (!result.move) {
			reason = "no_legal_move_from_search";
			winner = null;
			break;
		}

		position = applyMove(position, result.move);
		ply += 1;
	}

	if (!terminal && reason === "max_plies") {
		const status = getGameStatus(position);
		if (status.terminal) {
			const out = outcomeFromStatus(status);
			winner = out.winner;
			reason = out.reason;
		} else {
			winner = null;
			reason = "max_plies_draw";
		}
	}

	const point = scorePoint(winner, candidateColor);

	return {
		gameNo,
		candidateColor,
		opening: opening.name,
		openingApplied: openingState.openingApplied,
		plies: ply,
		reason,
		winner,
		point,
	};
};

const results = [];
let gameNo = 1;
for (let pairIdx = 0; pairIdx < pairCount; pairIdx += 1) {
	const opening = sampleOne(rng, openings);
	results.push(
		runSingleGame({
			gameNo,
			opening,
			candidateColor: "w",
		}),
	);
	gameNo += 1;
	results.push(
		runSingleGame({
			gameNo,
			opening,
			candidateColor: "b",
		}),
	);
	gameNo += 1;
}

const points = results.map((r) => r.point);
const wins = results.filter((r) => r.point === 1).length;
const draws = results.filter((r) => r.point === 0.5).length;
const losses = results.filter((r) => r.point === 0).length;
const conf = computeConfidence(points);

const prettyPct = (v) => `${(v * 100).toFixed(1)}%`;
const fmtElo = (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`;

if (!quiet) {
	console.log();
	console.log(`${C.bold}Self-Play Elo Gauntlet${C.reset}`);
	console.log(
		`${C.dim}games=${totalGames} seed=${seed} openings=${openingCount} openingPlies=${openingPlies}${C.reset}`,
	);
	console.log(
		`${C.dim}search depth=${baselineCfg.depth} nodes=${Number(baselineCfg.maxNodes).toLocaleString()} timeMs=${baselineCfg.maxTimeMs}${C.reset}`,
	);
	console.log(
		`${C.dim}candidateExtra=${JSON.stringify(candidateExtra)} baselineExtra=${JSON.stringify(baselineExtra)}${C.reset}`,
	);
	console.log();

	const header = ["#", "C", "Result", "Reason", "Opening", "Plies"];
	const widths = [4, 3, 8, 22, 30, 6];
	console.log(header.map((h, i) => h.padEnd(widths[i])).join(" "));
	console.log("-".repeat(82));

	for (const r of results) {
		const resultLabel =
			r.point === 1
				? `${C.green}1-0${C.reset}`
				: r.point === 0
					? `${C.red}0-1${C.reset}`
					: `${C.yellow}1/2${C.reset}`;
		console.log(
			[
				String(r.gameNo).padEnd(widths[0]),
				r.candidateColor.toUpperCase().padEnd(widths[1]),
				resultLabel.padEnd(widths[2] + 9),
				r.reason.slice(0, widths[3]).padEnd(widths[3]),
				r.opening.slice(0, widths[4]).padEnd(widths[4]),
				String(r.plies).padStart(widths[5]),
			].join(" "),
		);
		if (r.openingApplied.length > 0) {
			console.log(
				`${"".padEnd(widths[0] + widths[1] + widths[2] + widths[3] + 5)}${C.dim}${r.openingApplied.join(" ")}${C.reset}`,
			);
		}
	}

	console.log();
}

const summary = {
	timestamp: new Date().toISOString(),
	seed,
	totalGames,
	openingCount,
	openingPlies,
	maxPlies,
	baselineCfg,
	candidateCfg,
	wins,
	draws,
	losses,
	points: wins + draws * 0.5,
	scoreRate: conf.mean,
	elo: conf.elo,
	elo95: [conf.eloLo, conf.eloHi],
	results,
};

if (record) {
	appendFileSync(recordFile, `${JSON.stringify(summary)}\n`, "utf8");
}

console.log(
	`${C.bold}Candidate score${C.reset}: ${wins}-${draws}-${losses}  (${prettyPct(conf.mean)} points)`,
);
console.log(
	`${C.bold}Estimated Elo delta${C.reset}: ${fmtElo(conf.elo)}  (95% CI ${fmtElo(conf.eloLo)} .. ${fmtElo(conf.eloHi)})`,
);
if (record) {
	console.log(`${C.dim}Recorded to ${recordFile}${C.reset}`);
}
