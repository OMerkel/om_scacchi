// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Trend dashboard for the fixed-FEN benchmark suite.
//
// Reads the NDJSON history written by:
//   node scripts/benchmark-fen-suite.js --record
//
// Usage:
//   node scripts/benchmark-trend.js [--file <path>] [--last N] [--no-color]
//
//   --file  history file (default: scripts/.benchmark-history.ndjson)
//   --last  show only the last N runs (default: all)
//   --no-color  plain ASCII output (useful for log files)

import { readFileSync } from "node:fs";

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fileArg = args.includes("--file")
	? args[args.indexOf("--file") + 1]
	: new URL(".benchmark-history.ndjson", import.meta.url).pathname.replace(
			/^\/([A-Za-z]:)/,
			"$1",
		);
const lastN = args.includes("--last")
	? Number(args[args.indexOf("--last") + 1])
	: null;
const noColor = args.includes("--no-color");

// ── Colors ─────────────────────────────────────────────────────────────────
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

// ── Load history ───────────────────────────────────────────────────────────
let raw;
try {
	raw = readFileSync(fileArg, "utf8");
} catch {
	console.error(
		`No history file found at ${fileArg}.\nRun: node scripts/benchmark-fen-suite.js --record`,
	);
	process.exit(1);
}

let runs = raw
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

if (lastN) runs = runs.slice(-lastN);

if (runs.length === 0) {
	console.error(
		"History file is empty — run the benchmark with --record first.",
	);
	process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────
const bar = "▁▂▃▄▅▆▇█".split(""); // 8 levels of block character
const sparkline = (values) => {
	if (values.length === 0) return "";
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	return values
		.map((v) => {
			const idx = Math.round(((v - min) / range) * (bar.length - 1));
			return bar[idx];
		})
		.join("");
};

const pct = (n, d) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
const fixed1 = (n) => Number(n).toFixed(1);

// ── Summary table: one row per run ────────────────────────────────────────
const HR = "─".repeat(80);
console.log();
console.log(
	`${C.bold}Benchmark Trend Dashboard${C.reset}  (${runs.length} run${runs.length > 1 ? "s" : ""})`,
);
console.log(HR);
console.log(
	`${"Date & Time".padEnd(22)} ${"Pass".padEnd(7)} ${"Pass%".padEnd(7)} ${"AvgDepth".padEnd(10)} ${"AvgkNps".padEnd(9)}`,
);
console.log(HR);
for (const r of runs) {
	const ts = r.timestamp.replace("T", " ").slice(0, 19);
	const passColor =
		r.passed === r.total
			? C.green
			: r.passed >= r.total * 0.8
				? C.yellow
				: C.red;
	console.log(
		`${ts.padEnd(22)} ${(`${passColor}${r.passed}/${r.total}${C.reset}`).padEnd(7 + passColor.length + C.reset.length)} ${pct(r.passed, r.total).padEnd(7)} ${fixed1(r.avgDepth).padEnd(10)} ${String(r.avgKnps).padEnd(9)}`,
	);
}

// ── Sparkline charts ───────────────────────────────────────────────────────
if (runs.length > 1) {
	console.log();
	console.log(`${C.bold}Sparklines  (oldest → newest)${C.reset}`);
	console.log(HR);

	const passRates = runs.map((r) => (r.passed / r.total) * 100);
	const avgDepths = runs.map((r) => r.avgDepth);
	const avgKnpss = runs.map((r) => r.avgKnps);

	const minRate = Math.min(...passRates).toFixed(0);
	const maxRate = Math.max(...passRates).toFixed(0);
	const minDepth = Math.min(...avgDepths).toFixed(1);
	const maxDepth = Math.max(...avgDepths).toFixed(1);
	const minKnps = Math.min(...avgKnpss);
	const maxKnps = Math.max(...avgKnpss);

	console.log(
		`Pass rate   ${C.green}${sparkline(passRates)}${C.reset}   ${minRate}% – ${maxRate}%`,
	);
	console.log(
		`Avg depth   ${C.cyan}${sparkline(avgDepths)}${C.reset}   ${minDepth} – ${maxDepth}`,
	);
	console.log(
		`Avg kNps    ${C.yellow}${sparkline(avgKnpss)}${C.reset}   ${minKnps} – ${maxKnps} k nps`,
	);
} else {
	console.log(
		`\n${C.dim}Run --record at least twice to see sparkline trends.${C.reset}`,
	);
}

// ── Per-position pass/fail history ────────────────────────────────────────
if (runs.length >= 1) {
	console.log();
	console.log(`${C.bold}Per-Position Pass/Fail History${C.reset}`);
	console.log(HR);

	// Collect unique position names in order of first appearance
	const allNames = [];
	const seen = new Set();
	for (const r of runs) {
		for (const p of r.positions ?? []) {
			if (!seen.has(p.name)) {
				seen.add(p.name);
				allNames.push(p.name);
			}
		}
	}

	// Latest run's result for comparison arrow
	const latest = runs.at(-1);
	const prev = runs.length >= 2 ? runs.at(-2) : null;

	for (const name of allNames) {
		// History bar: ✓ or ✗ for each run
		const histBar = runs
			.map((r) => {
				const pos = (r.positions ?? []).find((p) => p.name === name);
				if (!pos) return `${C.dim}·${C.reset}`;
				return pos.pass ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
			})
			.join("");

		const latestPos = (latest.positions ?? []).find((p) => p.name === name);
		const prevPos = prev
			? (prev.positions ?? []).find((p) => p.name === name)
			: null;

		let trend = "  ";
		if (latestPos && prevPos) {
			if (!prevPos.pass && latestPos.pass) trend = `${C.green}↑ ${C.reset}`;
			else if (prevPos.pass && !latestPos.pass) trend = `${C.red}↓ ${C.reset}`;
		}

		const nameShort = name.slice(0, 46).padEnd(46);
		const latestScore = latestPos
			? String(latestPos.score).padStart(7)
			: "      –";
		const latestKnps = latestPos ? `${latestPos.knps}k`.padStart(5) : "    –";
		console.log(
			`${trend}${nameShort}  ${histBar}  ${latestScore}  ${latestKnps} nps`,
		);
	}
}

console.log();
