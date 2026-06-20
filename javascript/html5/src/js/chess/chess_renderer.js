// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Chess SVG board renderer.
// Renders an 8x8 board with Unicode piece glyphs, coordinate labels,
// move highlights, legal-move indicators, and a side advantage bar.

import { pieceColor, WHITE } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Layout constants (viewBox 800×860)
const CELL = 90;
const BAR_W = 18;
const BAR_X = 2;
const RANK_LABEL_W = 26;
const BOARD_OFFSET_X = BAR_X + BAR_W + 6 + RANK_LABEL_W; // 52
const BOARD_OFFSET_Y = 2;
const STATUS_Y = 790;
const BOARD_SIZE = CELL * 8; // 720

// Colours
const LIGHT = "#f0d9b5";
const DARK = "#b58863";
const LAST_MOVE_LIGHT = "#cdd26a";
const LAST_MOVE_DARK = "#aaa23a";
const SELECTED_COLOR = "#829769";

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

const svgEl = (tag, attrs = {}) => {
	const el = document.createElementNS(SVG_NS, tag);
	Object.entries(attrs).forEach(([k, v]) => {
		el.setAttribute(k, String(v));
	});
	return el;
};

const squareX = (col) => BOARD_OFFSET_X + col * CELL;
const squareY = (row) => BOARD_OFFSET_Y + row * CELL;
const squareColor = (row, col) => ((row + col) % 2 === 0 ? LIGHT : DARK);

const parseUci = (uci) => {
	if (!uci || uci.length < 4) return null;
	const f = "abcdefgh";
	const fc = f.indexOf(uci[0]);
	const fr = 8 - Number.parseInt(uci[1], 10);
	const tc = f.indexOf(uci[2]);
	const tr = 8 - Number.parseInt(uci[3], 10);
	if (fc < 0 || tc < 0 || Number.isNaN(fr) || Number.isNaN(tr)) return null;
	return { from: { row: fr, col: fc }, to: { row: tr, col: tc } };
};

const chessStatusText = (status) => {
	if (!status?.terminal) return "";
	switch (status.reason) {
		case "checkmate":
			return status.winner === "w" ? "White wins ♔" : "Black wins ♚";
		case "stalemate":
			return "Stalemate – Draw";
		case "fifty_move":
			return "50-move rule – Draw";
		case "threefold_repetition":
			return "Threefold repetition – Draw";
		case "insufficient_material":
			return "Insufficient material – Draw";
		default:
			return "Game over";
	}
};

/**
 * Create a chess board SVG renderer.
 *
 * @param {HTMLElement} container      - DOM container for the SVG.
 * @param {Function}    onSquareClick  - Called with {row, col} on square click.
 * @param {Object}      theme          - Theme object with renderPiece method (optional, defaults to glyph).
 * @returns {{ render, svg }}
 */
export const createChessRenderer = (container, onSquareClick, theme = null) => {
	const svg = svgEl("svg", {
		viewBox: `0 0 800 860`,
		preserveAspectRatio: "xMidYMid meet",
		role: "img",
		"aria-label": "om_scacchi board",
	});
	svg.style.cssText = "display:block;width:100%;height:100%;";

	// ── Background ──────────────────────────────────────────────────────────
	svg.appendChild(
		svgEl("rect", { x: 0, y: 0, width: 800, height: 860, fill: "#1a1a2e" }),
	);

	// ── Advantage bar ────────────────────────────────────────────────────────
	// Bottom portion = white, top portion = black. Neutral = 50/50.
	svg.appendChild(
		svgEl("rect", {
			x: BAR_X,
			y: BOARD_OFFSET_Y,
			width: BAR_W,
			height: BOARD_SIZE,
			fill: "#222",
		}),
	);
	const whiteBar = svgEl("rect", {
		x: BAR_X,
		y: BOARD_OFFSET_Y + BOARD_SIZE / 2,
		width: BAR_W,
		height: BOARD_SIZE / 2,
		fill: "#fff",
	});
	svg.appendChild(whiteBar);

	// ── Status text ──────────────────────────────────────────────────────────
	const statusText = svgEl("text", {
		x: BOARD_OFFSET_X + BOARD_SIZE / 2,
		y: STATUS_Y,
		"text-anchor": "middle",
		style: "font:700 26px/1 system-ui,sans-serif;fill:#e2e8f0;",
	});
	svg.appendChild(statusText);

	// ── Board squares ────────────────────────────────────────────────────────
	const squareRects = Array.from({ length: 8 }, (_, row) =>
		Array.from({ length: 8 }, (_, col) => {
			const rect = svgEl("rect", {
				x: squareX(col),
				y: squareY(row),
				width: CELL,
				height: CELL,
				fill: squareColor(row, col),
			});
			svg.appendChild(rect);
			return rect;
		}),
	);

	// ── Rank labels (1-8) ────────────────────────────────────────────────────
	for (let row = 0; row < 8; row += 1) {
		const lbl = svgEl("text", {
			x: BOARD_OFFSET_X - 6,
			y: squareY(row) + CELL / 2 + 5,
			"text-anchor": "end",
			style: "font:500 13px system-ui,sans-serif;fill:#9ca3af;",
		});
		lbl.textContent = String(8 - row);
		svg.appendChild(lbl);
	}

	// ── File labels (a-h) ────────────────────────────────────────────────────
	for (let col = 0; col < 8; col += 1) {
		const lbl = svgEl("text", {
			x: squareX(col) + CELL / 2,
			y: BOARD_OFFSET_Y + BOARD_SIZE + 16,
			"text-anchor": "middle",
			style: "font:500 13px system-ui,sans-serif;fill:#9ca3af;",
		});
		lbl.textContent = "abcdefgh"[col];
		svg.appendChild(lbl);
	}

	// ── Legal-move dot layer ─────────────────────────────────────────────────
	const dotLayer = svgEl("g", { "aria-hidden": "true" });
	svg.appendChild(dotLayer);

	// ── Piece layer ──────────────────────────────────────────────────────────
	const pieceLayer = svgEl("g", { "aria-hidden": "true" });
	svg.appendChild(pieceLayer);

	// ── Interactive overlays ─────────────────────────────────────────────────
	const overlays = Array.from({ length: 8 }, (_, row) =>
		Array.from({ length: 8 }, (_, col) => {
			const rect = svgEl("rect", {
				x: squareX(col),
				y: squareY(row),
				width: CELL,
				height: CELL,
				fill: "transparent",
				opacity: 0,
				"data-row": row,
				"data-col": col,
			});
			rect.style.cursor = "default";
			rect.addEventListener("click", () => onSquareClick({ row, col }));
			svg.appendChild(rect);
			return rect;
		}),
	);

	container.innerHTML = "";
	container.appendChild(svg);

	// ────────────────────────────────────────────────────────────────────────
	// Render function
	// ────────────────────────────────────────────────────────────────────────
	/**
	 * @param {Object}  opts.position       - Chess position object (has .board)
	 * @param {Array}   opts.legalMoves     - Legal move objects for current side
	 * @param {Object}  [opts.selectedSquare] - {row, col} of selected piece
	 * @param {string}  [opts.lastMoveUci]  - UCI string of last move, e.g. "e2e4"
	 * @param {number}  [opts.evalScore]    - Centipawn eval (+white, -black)
	 * @param {Object}  [opts.status]       - Game status object
	 */
	const render = ({
		position,
		legalMoves = [],
		selectedSquare = null,
		lastMoveUci = null,
		evalScore = 0,
		status = null,
	}) => {
		if (!position?.board) return;

		// ── Advantage bar ──────────────────────────────────────────────────
		const clamped = Math.max(-800, Math.min(800, evalScore ?? 0));
		const whiteRatio = 0.5 + (clamped / 800) * 0.4;
		const whiteH = Math.round(whiteRatio * BOARD_SIZE);
		whiteBar.setAttribute("y", String(BOARD_OFFSET_Y + BOARD_SIZE - whiteH));
		whiteBar.setAttribute("height", String(whiteH));

		// ── Status text ────────────────────────────────────────────────────
		statusText.textContent = chessStatusText(status);

		// ── Build highlight sets ───────────────────────────────────────────
		const lastMove = parseUci(lastMoveUci);
		const lastMoveKeys = new Set(
			lastMove
				? [
						`${lastMove.from.row}:${lastMove.from.col}`,
						`${lastMove.to.row}:${lastMove.to.col}`,
					]
				: [],
		);

		const legalTargets = new Set();
		const legalOrigins = new Set();
		if (selectedSquare) {
			legalMoves
				.filter(
					(m) =>
						m.from.row === selectedSquare.row &&
						m.from.col === selectedSquare.col,
				)
				.forEach((m) => {
					legalTargets.add(`${m.to.row}:${m.to.col}`);
				});
		}
		legalMoves.forEach((m) => {
			legalOrigins.add(`${m.from.row}:${m.from.col}`);
		});

		// ── Square colours & cursor ────────────────────────────────────────
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const key = `${row}:${col}`;
				const isSelected =
					selectedSquare?.row === row && selectedSquare?.col === col;
				const isLight = (row + col) % 2 === 0;
				const isLast = lastMoveKeys.has(key);

				let fill;
				if (isSelected) {
					fill = SELECTED_COLOR;
				} else if (isLast) {
					fill = isLight ? LAST_MOVE_LIGHT : LAST_MOVE_DARK;
				} else {
					fill = squareColor(row, col);
				}
				squareRects[row][col].setAttribute("fill", fill);
				overlays[row][col].style.cursor =
					legalOrigins.has(key) || legalTargets.has(key)
						? "pointer"
						: "default";
			}
		}

		// ── Legal-move indicators ──────────────────────────────────────────
		while (dotLayer.firstChild) dotLayer.removeChild(dotLayer.firstChild);
		for (const key of legalTargets) {
			const [r, c] = key.split(":").map(Number);
			const occupied = position.board[r][c] !== null;
			if (occupied) {
				// Ring for captures
				dotLayer.appendChild(
					svgEl("rect", {
						x: squareX(c),
						y: squareY(r),
						width: CELL,
						height: CELL,
						fill: "none",
						stroke: "rgba(0,0,0,0.25)",
						"stroke-width": 6,
					}),
				);
			} else {
				// Dot for quiet moves
				dotLayer.appendChild(
					svgEl("circle", {
						cx: squareX(c) + CELL / 2,
						cy: squareY(r) + CELL / 2,
						r: CELL * 0.16,
						fill: "rgba(0,0,0,0.18)",
					}),
				);
			}
		}

		// ── Pieces ─────────────────────────────────────────────────────────
		while (pieceLayer.firstChild) pieceLayer.removeChild(pieceLayer.firstChild);

		const renderWithTheme = async () => {
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					const piece = position.board[row][col];
					if (!piece) continue;

					if (theme && typeof theme.renderPiece === "function") {
						// Use theme's renderPiece (may be async for SVG)
						await theme.renderPiece({
							piece,
							squareX: squareX(col),
							squareY: squareY(row),
							CELL,
							pieceLayer,
						});
					} else {
						// Fallback to glyph theme
						const glyph = GLYPHS[piece];
						if (!glyph) continue;
						const isWhitePiece = pieceColor(piece) === WHITE;
						const cx = squareX(col) + CELL / 2;
						const cy = squareY(row) + CELL * 0.73;
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
					}
				}
			}
		};

		renderWithTheme().catch((err) => {
			console.error("Error rendering pieces:", err);
		});
	};

	return { render, svg };
};
