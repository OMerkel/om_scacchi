// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Trend dashboard for self-play gauntlet runs.
//
// Reads the NDJSON history written by:
//   node scripts/selfplay-gauntlet.js --record
//
// Usage:
//   node scripts/selfplay-trend.js [--file <path>] [--last N] [--no-color]

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const fileArg = args.includes("--file")
	? args[args.indexOf("--file") + 1]
	: new URL(".selfplay-history.ndjson", import.meta.url).pathname.replace(
			/^\/([A-Za-z]:)/,
			"$1",
		);
const lastN = args.includes("--last")
	? Number(args[args.indexOf("--last") + 1])
	: null;
const noColor = args.includes("--no-color");

const C = noColor
	? {
			reset: "",
			green: "",
			red: "",
			yellow: "",
			cyan: "",
			bold: "",
			dim: "",
		}
	: {
			reset: "\x1b[0m",
			green: "\x1b[32m",
			red: "\x1b[31m",
			yellow: "\x1b[33m",
			cyan: "\x1b[36m",
			bold: "\x1b[1m",
			dim: "\x1b[2m",
		};

let raw;
try {
	raw = readFileSync(fileArg, "utf8");
} catch {
	console.error(
		`No history file found at ${fileArg}.\nRun: node scripts/selfplay-gauntlet.js --record`,
	);
	process.exit(1);
}

let runs = raw
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

if (lastN) runs = runs.slice(-lastN);

if (runs.length === 0) {
	console.error("History file is empty - run gauntlet with --record first.");
	process.exit(1);
}

const sparkBlocks = "▁▂▃▄▅▆▇█".split("");
const sparkline = (values) => {
	if (values.length === 0) return "";
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	return values
		.map((v) => {
			const idx = Math.round(((v - min) / range) * (sparkBlocks.length - 1));
			return sparkBlocks[idx];
		})
		.join("");
};

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const fmtElo = (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`;

const summarizeCfgDelta = (run) => {
	const baseline = run.baselineCfg ?? {};
	const candidate = run.candidateCfg ?? {};
	const keys = [
		...new Set([...Object.keys(baseline), ...Object.keys(candidate)]),
	]
		.sort()
		.filter(
			(k) => JSON.stringify(baseline[k]) !== JSON.stringify(candidate[k]),
		);
	if (keys.length === 0) return "same config";
	const pieces = keys.slice(0, 3).map((k) => `${k}:${candidate[k]}`);
	if (keys.length > 3) pieces.push(`+${keys.length - 3}`);
	return pieces.join(", ");
};

console.log();
console.log(
	`${C.bold}Self-Play Trend Dashboard${C.reset}  (${runs.length} run${runs.length > 1 ? "s" : ""})`,
);
console.log("─".repeat(108));
console.log(
	`${"Date & Time".padEnd(22)} ${"Games".padEnd(7)} ${"W-D-L".padEnd(13)} ${"Score".padEnd(8)} ${"Elo".padEnd(8)} ${"95% CI".padEnd(17)} ${"Config delta"}`,
);
console.log("─".repeat(108));

for (const run of runs) {
	const ts = String(run.timestamp ?? "")
		.replace("T", " ")
		.slice(0, 19);
	const elo = Number(run.elo ?? 0);
	const lo = Number(run.elo95?.[0] ?? 0);
	const hi = Number(run.elo95?.[1] ?? 0);
	const scoreRate = Number(run.scoreRate ?? 0);
	const wdl = `${run.wins ?? 0}-${run.draws ?? 0}-${run.losses ?? 0}`;
	const eloColor = elo > 0 ? C.green : elo < 0 ? C.red : C.yellow;
	const ciColor = lo > 0 ? C.green : hi < 0 ? C.red : C.yellow;

	console.log(
		`${ts.padEnd(22)} ${String(run.totalGames ?? 0).padEnd(7)} ${wdl.padEnd(13)} ${pct(scoreRate).padEnd(8)} ${(`${eloColor}${fmtElo(elo)}${C.reset}`).padEnd(8 + eloColor.length + C.reset.length)} ${(`${ciColor}${fmtElo(lo)}..${fmtElo(hi)}${C.reset}`).padEnd(17 + ciColor.length + C.reset.length)} ${summarizeCfgDelta(run)}`,
	);
}

if (runs.length > 1) {
	const scoreSeries = runs.map((r) => Number(r.scoreRate ?? 0) * 100);
	const eloSeries = runs.map((r) => Number(r.elo ?? 0));
	const drawSeries = runs.map((r) => {
		const games = Number(r.totalGames ?? 0);
		if (games <= 0) return 0;
		return (Number(r.draws ?? 0) / games) * 100;
	});

	console.log();
	console.log(`${C.bold}Sparklines  (oldest -> newest)${C.reset}`);
	console.log("─".repeat(108));
	console.log(
		`Score %     ${C.cyan}${sparkline(scoreSeries)}${C.reset}   ${Math.min(...scoreSeries).toFixed(1)} - ${Math.max(...scoreSeries).toFixed(1)}`,
	);
	console.log(
		`Elo delta   ${C.green}${sparkline(eloSeries)}${C.reset}   ${fmtElo(Math.min(...eloSeries))} - ${fmtElo(Math.max(...eloSeries))}`,
	);
	console.log(
		`Draw %      ${C.yellow}${sparkline(drawSeries)}${C.reset}   ${Math.min(...drawSeries).toFixed(1)} - ${Math.max(...drawSeries).toFixed(1)}`,
	);
} else {
	console.log(
		`\n${C.dim}Run --record at least twice to visualize trends.${C.reset}`,
	);
}

console.log();
