// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// SVG-based chess piece theme: loads SVG graphics for each piece type

import { PIECE_TYPES, pieceType } from "../chess/types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
	const el = document.createElementNS(SVG_NS, tag);
	Object.entries(attrs).forEach(([k, v]) => {
		el.setAttribute(k, String(v));
	});
	return el;
};

// Map piece codes to SVG file names
const pieceToSvg = (piece) => {
	const type = pieceType(piece);
	const color = piece === piece.toUpperCase() ? "white" : "black";

	const typeMap = {
		[PIECE_TYPES.KING]: "king",
		[PIECE_TYPES.QUEEN]: "queen",
		[PIECE_TYPES.ROOK]: "rook",
		[PIECE_TYPES.BISHOP]: "bishop",
		[PIECE_TYPES.KNIGHT]: "knight",
		[PIECE_TYPES.PAWN]: "pawn",
	};

	return `${color}_${typeMap[type]}`;
};

const svgCache = new Map();

/**
 * Load an SVG file and return its content as a cloned element
 */
const loadSvg = async (filename) => {
	if (svgCache.has(filename)) {
		return svgCache.get(filename).cloneNode(true);
	}

	try {
		const url = new URL(
			`../../img/theme/nice_svg/${filename}.svg`,
			import.meta.url,
		);
		const response = await fetch(url);
		if (!response.ok) return null;

		const text = await response.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "image/svg+xml");

		if (doc.documentElement.tagName === "parsererror") {
			console.error(`Failed to parse SVG: ${filename}`);
			return null;
		}

		const svgElement = doc.documentElement;
		svgCache.set(filename, svgElement);
		return svgElement.cloneNode(true);
	} catch (error) {
		console.error(`Failed to load SVG: ${filename}`, error);
		return null;
	}
};

export const themeSvg = {
	/**
	 * Render a single piece using SVG theme
	 * @param {Object} params - { piece, squareX, squareY, CELL, pieceLayer }
	 * @returns {Promise<void>}
	 */
	async renderPiece({ piece, squareX, squareY, CELL, pieceLayer }) {
		if (!piece) return;

		const filename = pieceToSvg(piece);
		if (!filename) return;

		const svgContent = await loadSvg(filename);
		if (!svgContent) {
			console.warn(`SVG not found for piece ${piece}`);
			return;
		}

		const cx = squareX + CELL / 2;
		const cy = squareY + CELL / 2;
		const size = CELL * 0.72; // Match glyph theme size

		// Create wrapper group centered on piece position
		const group = svgEl("g", {
			transform: `translate(${cx - size / 2}, ${cy - size / 2})`,
		});

		// Remove hardcoded dimensions and set proper sizing
		svgContent.removeAttribute("width");
		svgContent.removeAttribute("height");
		svgContent.setAttribute("width", size);
		svgContent.setAttribute("height", size);
		svgContent.setAttribute("preserveAspectRatio", "xMidYMid meet");
		svgContent.style.pointerEvents = "none";
		svgContent.style.userSelect = "none";

		group.appendChild(svgContent);
		pieceLayer.appendChild(group);
	},
};
