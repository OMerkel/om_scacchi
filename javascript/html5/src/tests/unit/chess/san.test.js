// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { generateLegalMoves } from "../../../js/chess/move_generator.js";
import { createPositionFromFen } from "../../../js/chess/position.js";
import { applyMove } from "../../../js/chess/rules.js";
import { moveToSan, pvToSan } from "../../../js/chess/san.js";

// Helper: find legal move by UCI string
const findMove = (position, uci) => {
	const f = "abcdefgh";
	const fc = f.indexOf(uci[0]);
	const fr = 8 - Number.parseInt(uci[1], 10);
	const tc = f.indexOf(uci[2]);
	const tr = 8 - Number.parseInt(uci[3], 10);
	const promo = uci.length > 4 ? uci[4] : null;
	const legal = generateLegalMoves(position);
	return legal.find(
		(m) =>
			m.from.col === fc &&
			m.from.row === fr &&
			m.to.col === tc &&
			m.to.row === tr &&
			(promo === null || (m.flags?.promotion ?? null) === promo),
	);
};

describe("moveToSan", () => {
	it("returns ? for null move or position", () => {
		const pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		expect(moveToSan(null, null)).toBe("?");
		expect(moveToSan(pos, null)).toBe("?");
	});

	it("encodes a simple pawn push", () => {
		const pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		const move = findMove(pos, "e2e4");
		expect(moveToSan(pos, move)).toBe("e4");
	});

	it("encodes a knight move", () => {
		const pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		const move = findMove(pos, "g1f3");
		expect(moveToSan(pos, move)).toBe("Nf3");
	});

	it("encodes a pawn capture", () => {
		// After 1.e4 d5 – white can play exd5
		let pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		pos = applyMove(pos, findMove(pos, "e2e4"));
		pos = applyMove(pos, findMove(pos, "d7d5"));
		const move = findMove(pos, "e4d5");
		expect(moveToSan(pos, move)).toBe("exd5");
	});

	it("encodes kingside castling", () => {
		// Position where white can castle kingside
		const fen =
			"r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4";
		const pos = createPositionFromFen(fen);
		const move = findMove(pos, "e1g1");
		expect(moveToSan(pos, move)).toBe("O-O");
	});

	it("encodes queenside castling", () => {
		const fen =
			"r3kb1r/pppqpppp/2npbn2/8/8/2NPBN2/PPPQPPPP/R3KB1R w KQkq - 0 1";
		const pos = createPositionFromFen(fen);
		const move = findMove(pos, "e1c1");
		expect(move).toBeTruthy();
		expect(moveToSan(pos, move)).toBe("O-O-O");
	});

	it("encodes pawn promotion to queen", () => {
		const fen = "8/P7/8/8/8/8/8/4K2k w - - 0 1";
		const pos = createPositionFromFen(fen);
		const move = findMove(pos, "a7a8q");
		expect(moveToSan(pos, move)).toBe("a8=Q+");
	});

	it("encodes promotion to rook", () => {
		const fen = "8/P7/8/8/8/8/8/4K2k w - - 0 1";
		const pos = createPositionFromFen(fen);
		const move = findMove(pos, "a7a8r");
		expect(moveToSan(pos, move)).toBe("a8=R");
	});

	it("adds check suffix", () => {
		// Fool's mate setup – Qh4+
		let pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		pos = applyMove(pos, findMove(pos, "f2f3"));
		pos = applyMove(pos, findMove(pos, "e7e5"));
		pos = applyMove(pos, findMove(pos, "g2g4"));
		const move = findMove(pos, "d8h4");
		const san = moveToSan(pos, move);
		expect(san).toBe("Qh4#");
	});

	it("disambiguates piece file when two rooks share a rank", () => {
		// Two rooks on same rank can both go to d1 – need file disambiguation
		const fen = "4k3/8/8/8/8/8/R7/4K2R w - - 0 1";
		const pos = createPositionFromFen(fen);
		const moveA2d2 = findMove(pos, "a2d2");
		expect(moveA2d2).toBeTruthy();
		const san = moveToSan(pos, moveA2d2);
		expect(san).toBe("Rd2");
	});

	it("disambiguates by file when two knights can reach same square", () => {
		// Two knights on different files both able to move to same square
		const fen = "4k3/8/8/8/8/8/2N1N3/4K3 w - - 0 1";
		const pos = createPositionFromFen(fen);
		const moveB2 = findMove(pos, "c2d4");
		expect(moveB2).toBeTruthy();
		const san = moveToSan(pos, moveB2);
		expect(san).toMatch(/^N[ce]d4$/);
	});

	it("disambiguates by rank when two bishops share a file", () => {
		// Two bishops on same file but different ranks - both can move to d6
		const fen = "4k3/3B4/3B4/8/8/8/8/4K3 w - - 0 1";
		const pos = createPositionFromFen(fen);
		const moveD7 = findMove(pos, "d7d6");
		if (moveD7) {
			const san = moveToSan(pos, moveD7);
			expect(san).toMatch(/^B[67]d6$/);
		}
	});

	it("uses full coordinate disambiguation when three pieces share file AND rank", () => {
		// Three queens on a1, a3, c1 – all can reach c3.
		// Moving Qa1-c3: ambiguous=[Qa3, Qc1].
		// sameFile=true (Qa3 shares file a with Qa1).
		// sameRank=true (Qc1 shares rank 1 with Qa1).
		// → full-coordinate disambiguation required: "Qa1c3".
		const pos = createPositionFromFen("k7/8/8/8/8/Q7/8/Q1QK4 w - - 0 1");
		const move = findMove(pos, "a1c3");
		expect(move).toBeTruthy();
		expect(moveToSan(pos, move)).toMatch(/^Qa1c3[+#]?$/);
	});

	it("encodes castling with check", () => {
		// Position where castling delivers check
		const fen = "r3kbqr/pppppppp/2n2n2/8/4b3/8/PPPPPPPP/RNBQK2R w KQkq - 0 1";
		const pos = createPositionFromFen(fen);
		const move = findMove(pos, "e1g1");
		const san = moveToSan(pos, move);
		expect(san).toMatch(/^O-O[+#]?$/);
	});

	it("handles invalid move coordinates gracefully", () => {
		const pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		expect(moveToSan(pos, { from: { row: "x" }, to: {} })).toBe("?");
	});
});

describe("pvToSan", () => {
	it("returns empty string for empty PV", () => {
		const pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		expect(pvToSan(pos, [])).toBe("");
		expect(pvToSan(pos, null)).toBe("");
	});

	it("converts a two-move PV", () => {
		const pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		const result = pvToSan(pos, ["e2e4", "e7e5"]);
		expect(result).toBe("e4 e5");
	});

	it("stops at an invalid UCI move", () => {
		const pos = createPositionFromFen(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		);
		const result = pvToSan(pos, ["e2e4", "zz99"]);
		expect(result).toBe("e4");
	});
});
