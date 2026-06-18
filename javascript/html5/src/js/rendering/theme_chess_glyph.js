// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Glyph-based chess piece theme: Unicode chess glyphs

import { pieceColor, WHITE } from "../chess/types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
	const el = document.createElementNS(SVG_NS, tag);
	Object.entries(attrs).forEach(([k, v]) => {
		el.setAttribute(k, String(v));
	});
	return el;
};

// Unicode piece glyphs
const GLYPHS = {
	K: "♔",
	Q: "♕",
	R: "♖",
	B: "♗",
	N: "♘",
	P: "♙",
	k: "♚",
	q: "♛",
	r: "♜",
	b: "♝",
	n: "♞",
	p: "♟",
};

export const themeGlyph = {
	/**
	 * Render a single piece using glyph style
	 * @param {Object} params - { piece, squareX, squareY, CELL, pieceLayer }
	 * @returns {void}
	 */
	renderPiece({ piece, squareX, squareY, CELL, pieceLayer }) {
		const glyph = GLYPHS[piece];
		if (!glyph) return;

		const isWhitePiece = pieceColor(piece) === WHITE;
		const cx = squareX + CELL / 2;
		const cy = squareY + CELL * 0.73;
		const fontSize = Math.round(CELL * 0.72);

		// Drop-shadow for legibility
		const shadow = svgEl("text", {
			x: cx + 1,
			y: cy + 2,
			"text-anchor": "middle",
			style: `font:${fontSize}px serif;fill:rgba(0,0,0,0.45);user-select:none;pointer-events:none;`,
		});
		shadow.textContent = glyph;
		pieceLayer.appendChild(shadow);

		const txt = svgEl("text", {
			x: cx,
			y: cy,
			"text-anchor": "middle",
			style: `font:${fontSize}px serif;fill:${isWhitePiece ? "#fff" : "#1a1a2e"};stroke:${isWhitePiece ? "#1a1a2e" : "none"};stroke-width:${isWhitePiece ? 0.8 : 0};user-select:none;pointer-events:none;`,
		});
		txt.textContent = glyph;
		pieceLayer.appendChild(txt);
	},
};
