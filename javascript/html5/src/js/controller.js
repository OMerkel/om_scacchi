// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// @author Oliver Merkel, <Merkel(dot)Oliver(at)web(dot)de>
// SPDX-License-Identifier: MIT

import { searchBestMove } from "./chess/ai/negamax_search.js";
import { pickNonRepetitionAlternative } from "./chess/ai/repetition_policy.js";
import { computeTimeLimits } from "./chess/ai/time_manager.js";
import { serializeFen } from "./chess/fen.js";
import { getGameStatus } from "./chess/game.js";
import { generateLegalMoves, moveToUci } from "./chess/move_generator.js";
import {
	createInitialPosition,
	createPositionFromFen,
	toFen,
} from "./chess/position.js";
import { applyMove } from "./chess/rules.js";
import { createTranspositionTable } from "./chess/transposition_table.js";

// ---------------------------------------------------------------------------
// Mutable controller state (single worker, no shared state)
// ---------------------------------------------------------------------------

let chessPosition = createInitialPosition();
let positionHistory = [createInitialPosition()]; // Track all positions for undo
let moveHistory = []; // Track all moves (parallel to positionHistory)
let gameSessionId = 1;
const persistentTt = createTranspositionTable(120000);
let settings = {
	playerSouth: "Human",
	playerNorth: "Human",
	difficultySouth: "Medium",
	difficultyNorth: "Medium",
	deviceProfile: "Auto",
	resolvedDeviceProfile: "Desktop",
};

const OPENING_BOOK_URL = new URL("./chess/opening_book.json", import.meta.url);
let OPENING_BOOK = new Map();

const toOpeningBookMap = (payload) => {
	const entries = Array.isArray(payload?.entries) ? payload.entries : [];
	const map = new Map();

	for (const entry of entries) {
		if (
			!entry ||
			typeof entry.fen !== "string" ||
			!Array.isArray(entry.moves)
		) {
			continue;
		}

		const normalizedMoves = entry.moves
			.filter((move) => move && typeof move.uci === "string")
			.map((move) => ({
				uci: move.uci,
				weight: Math.max(1, Number(move.weight) || 1),
				name: typeof move.name === "string" ? move.name : null,
				positionName: typeof entry.name === "string" ? entry.name : null,
			}));

		if (normalizedMoves.length > 0) {
			map.set(entry.fen, normalizedMoves);
		}
	}

	return map;
};

const loadOpeningBook = async () => {
	try {
		const response = await fetch(OPENING_BOOK_URL);
		if (!response.ok) return;
		const payload = await response.json();
		OPENING_BOOK = toOpeningBookMap(payload);
	} catch {
		OPENING_BOOK = new Map();
	}
};

const openingBookReady = loadOpeningBook();

const getOpeningName = (position) => {
	const candidates = OPENING_BOOK.get(serializeFen(position));
	if (!candidates || candidates.length === 0) return null;
	return candidates[0]?.positionName ?? null;
};

const pickBookMove = (position) => {
	const key = serializeFen(position);
	const candidates = OPENING_BOOK.get(key);
	if (!candidates || candidates.length === 0) return null;
	const legal = generateLegalMoves(position);

	const legalWeighted = candidates
		.map((entry) =>
			typeof entry === "string"
				? { uci: entry, weight: 1 }
				: {
						uci: entry.uci,
						weight: Math.max(1, entry.weight ?? 1),
						name: entry.name ?? null,
						positionName: entry.positionName ?? null,
					},
		)
		.map((entry) => ({
			...entry,
			move: legal.find((m) => moveToUci(m) === entry.uci) ?? null,
		}))
		.filter((entry) => entry.move);

	if (legalWeighted.length === 0) return null;

	const totalWeight = legalWeighted.reduce(
		(sum, entry) => sum + entry.weight,
		0,
	);
	let pick = Math.random() * totalWeight;
	for (const entry of legalWeighted) {
		pick -= entry.weight;
		if (pick <= 0) return entry;
	}

	return legalWeighted[legalWeighted.length - 1];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const applySettings = (s) => {
	if (!s) return;
	settings = {
		playerSouth: "playersouth" in s ? s.playersouth : settings.playerSouth,
		playerNorth: "playernorth" in s ? s.playernorth : settings.playerNorth,
		difficultySouth:
			"difficultysouth" in s ? s.difficultysouth : settings.difficultySouth,
		difficultyNorth:
			"difficultynorth" in s ? s.difficultynorth : settings.difficultyNorth,
		deviceProfile:
			"deviceprofile" in s ? s.deviceprofile : settings.deviceProfile,
		resolvedDeviceProfile:
			"resolveddeviceprofile" in s
				? s.resolveddeviceprofile
				: settings.resolvedDeviceProfile,
	};
};

const postChess = (request, extra = {}) =>
	self.postMessage({
		class: "request",
		request,
		gameSessionId,
		chessPosition,
		fen: toFen(chessPosition),
		openingName: getOpeningName(chessPosition),
		...extra,
	});

const postChessHumanToMove = (status) =>
	postChess("chess_human_to_move", {
		status,
		legalMoves: generateLegalMoves(chessPosition),
	});

const isChessAiTurn = () =>
	(chessPosition.sideToMove === "w" && settings.playerSouth === "AI") ||
	(chessPosition.sideToMove === "b" && settings.playerNorth === "AI");

const getCurrentTurnPlayer = () =>
	chessPosition.sideToMove === "w" ? "South" : "North";

const getCurrentPlayerType = () =>
	getCurrentTurnPlayer() === "South"
		? settings.playerSouth
		: settings.playerNorth;
const sameMove = (a, b) =>
	a.from.row === b.from.row &&
	a.from.col === b.from.col &&
	a.to.row === b.to.row &&
	a.to.col === b.to.col &&
	(a.flags?.promotion ?? null) === (b.flags?.promotion ?? null);

const moveChess = (candidateMove) => {
	const legal = generateLegalMoves(chessPosition);
	const selected = legal.find((move) => sameMove(move, candidateMove));
	if (!selected) {
		postChess("chess_redraw", { info: "illegal_move" });
		return;
	}

	chessPosition = applyMove(chessPosition, selected);
	positionHistory.push(chessPosition); // Add to history after move
	moveHistory.push(moveToUci(selected)); // Track the move
	const status = getGameStatus(chessPosition);
	postChess("chess_redraw", {
		status,
		latestMoveUci: moveToUci(selected),
	});

	if (status.terminal) return;

	if (isChessAiTurn()) {
		postChess("chess_ai_to_move", { status });
	} else {
		postChessHumanToMove(status);
	}
};

const undoChess = () => {
	// Determine which human player's turn it is NOW (before undo)
	if (positionHistory.length <= 1) {
		// Can't undo from initial position
		return;
	}

	const initialTurnPlayer = getCurrentTurnPlayer();
	const initialPlayerType = getCurrentPlayerType();

	// If it's not a human's turn, we can't undo
	if (initialPlayerType !== "Human") {
		return;
	}

	// Keep undoing until we find a position where it's the SAME human player's turn
	// We need to undo at least 2 moves (the opponent's move and our previous move)
	// or until we reach the start of the history
	let undoCount = 0;
	const maxUndoSteps = positionHistory.length - 1;

	while (positionHistory.length > 1 && undoCount < maxUndoSteps) {
		positionHistory.pop();
		moveHistory.pop(); // Also pop from move history to keep in sync
		chessPosition = positionHistory[positionHistory.length - 1];
		undoCount++;

		const currentTurnPlayer = getCurrentTurnPlayer();
		const currentPlayerType = getCurrentPlayerType();

		// Stop undoing when we're back to the same human player's turn
		// (we've undone the opponent's move and our own move)
		if (
			currentTurnPlayer === initialTurnPlayer &&
			currentPlayerType === "Human"
		) {
			break;
		}
	}

	const status = getGameStatus(chessPosition);
	postChess("chess_redraw", { status });

	if (!status.terminal && !isChessAiTurn()) {
		postChessHumanToMove(status);
	}
};

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.addEventListener("message", async ({ data }) => {
	await openingBookReady;
	switch (data.request) {
		case "chess_start": {
			gameSessionId =
				typeof data.gameSessionId === "number"
					? data.gameSessionId
					: gameSessionId;
			applySettings(data.settings);
			persistentTt.clear();
			chessPosition = data.fen
				? (() => {
						try {
							return createPositionFromFen(data.fen);
						} catch {
							return createInitialPosition();
						}
					})()
				: createInitialPosition();
			positionHistory = [chessPosition]; // Reset history for new game
			// Restore moveHistory if provided (from persistence); otherwise start fresh.
			// Normalize entries: persistence stores {moveNumber, san, uci} objects;
			// the controller needs plain UCI strings.
			moveHistory = Array.isArray(data.moveHistory)
				? data.moveHistory.map((entry) =>
						typeof entry === "string" ? entry : (entry?.uci ?? ""),
				  )
			: [];
			const status = getGameStatus(chessPosition);
			postChess("chess_redraw", { status });

			if (status.terminal) break;

			if (isChessAiTurn()) {
				postChess("chess_ai_to_move", { status });
			} else {
				postChessHumanToMove(status);
			}
			break;
		}

		case "chess_move": {
			applySettings(data.settings);
			moveChess(data.action);
			break;
		}

		case "chess_action_by_ai": {
			applySettings(data.settings);
			const pvStartFen = toFen(chessPosition);

			const bookChoice = pickBookMove(chessPosition);
			if (bookChoice) {
				const bookMove = bookChoice.move;
				const openingName = bookChoice.name ?? bookChoice.positionName ?? null;
				chessPosition = applyMove(chessPosition, bookMove);
				positionHistory.push(chessPosition); // Add to history after AI book move
				moveHistory.push(moveToUci(bookMove)); // Track the move
				const status = getGameStatus(chessPosition);
				postChess("chess_redraw", {
					status,
					latestMoveUci: moveToUci(bookMove),
					engineInfo: {
						pv: [moveToUci(bookMove)],
						pvStartFen,
						nodes: 0,
						score: 0,
						depth: 0,
						bestMove: moveToUci(bookMove),
						fromBook: true,
						openingName,
					},
				});

				if (status.terminal) break;

				if (isChessAiTurn()) {
					postChess("chess_ai_to_move", { status });
				} else {
					postChessHumanToMove(status);
				}
				break;
			}

			const depthByDifficulty = {
				easy: 3,
				medium: 6,
				hard: 10,
			};
			const maxNodesByDifficulty = {
				easy: 150000,
				medium: 1200000,
				hard: 3500000,
			};
			const maxTimeByDifficulty = {
				easy: 400,
				medium: 1600,
				hard: 5000,
			};
			const moveOverheadByDifficulty = {
				easy: 16,
				medium: 30,
				hard: 65,
			};
			const activeDifficulty =
				chessPosition.sideToMove === "w"
					? settings.difficultySouth
					: settings.difficultyNorth;
			const normalizedDifficulty = (activeDifficulty || "medium").toLowerCase();
			const depth = depthByDifficulty[normalizedDifficulty] ?? 4;
			const baseTime = maxTimeByDifficulty[normalizedDifficulty] ?? 900;
			const overhead = moveOverheadByDifficulty[normalizedDifficulty] ?? 30;

			// Check if the current position was seen earlier in the game
			// (helps the time manager give extra time to find repetition-avoiding moves).
			const currentFen = serializeFen(chessPosition);
			const seenBefore = positionHistory
				.slice(0, -1)
				.some((p) => serializeFen(p) === currentFen);

			const { softTimeMs, hardTimeMs } = computeTimeLimits(
				chessPosition,
				baseTime,
				overhead,
				seenBefore,
			);

			const searchOptions = {
				depth,
				maxNodes: maxNodesByDifficulty[normalizedDifficulty] ?? 500000,
				maxTimeMs: baseTime,
				softTimeMs,
				hardTimeMs,
				iterativeDeepening: true,
				tt: persistentTt,
			};

			let result = searchBestMove(chessPosition, searchOptions);
			result = pickNonRepetitionAlternative({
				position: chessPosition,
				result,
				searchOptions,
				deps: {
					applyMove,
					getGameStatus,
					generateLegalMoves,
					sameMove,
					searchBestMove,
					moveToUci,
					tt: persistentTt,
				},
			});

			if (result.move) {
				chessPosition = applyMove(chessPosition, result.move);
				positionHistory.push(chessPosition); // Add to history after AI negamax move
				moveHistory.push(result.moveUci); // Track the move
			}

			const status = getGameStatus(chessPosition);
			postChess("chess_redraw", {
				status,
				latestMoveUci: result.moveUci,
				engineInfo: {
					pv: result.pv,
					pvStartFen,
					nodes: result.nodes,
					score: result.score,
					depth: result.searchedDepth,
					bestMove: result.moveUci,
					fromBook: false,
					openingName: null,
					avoidedThreefold: result.avoidedThreefold === true,
				},
			});

			if (status.terminal) break;

			if (isChessAiTurn()) {
				postChess("chess_ai_to_move", { status });
			} else {
				postChessHumanToMove(status);
			}
			break;
		}

		case "chess_undo": {
			applySettings(data.settings);
			undoChess();
			break;
		}

		case "chess_browse_to_ply": {
			// Reconstruct position by replaying moves up to the given ply
			const plyIndex = data.plyIndex ?? 0;
			if (plyIndex < 0 || plyIndex >= moveHistory.length) {
				postChess("chess_redraw", {
					info: "invalid_ply",
					latestMoveUci: null,
					isBrowseRedraw: true,
				});
				break;
			}

			// Replay moves from the start up to plyIndex
			chessPosition = createInitialPosition();
			for (let i = 0; i <= plyIndex; i++) {
				if (i < moveHistory.length) {
					const uci = moveHistory[i];
					const legal = generateLegalMoves(chessPosition);
					const move = legal.find((m) => moveToUci(m) === uci);
					if (!move) {
						postChess("chess_redraw", {
							info: "move_not_found",
							isBrowseRedraw: true,
						});
						return;
					}
					chessPosition = applyMove(chessPosition, move);
				}
			}

			const status = getGameStatus(chessPosition);
			postChess("chess_redraw", {
				status,
				latestMoveUci: moveHistory[plyIndex] ?? null,
				isBrowseRedraw: true,
			});
			break;
		}

		case "chess_continue_from_browse": {
			// Resume game from the selected ply
			const plyIndex = data.plyIndex ?? 0;
			if (plyIndex < 0 || plyIndex >= moveHistory.length) {
				postChess("chess_redraw", {
					info: "invalid_ply",
					latestMoveUci: null,
				});
				break;
			}

			// Truncate move history and position history to the selected ply
			moveHistory.length = plyIndex + 1;
			positionHistory.length = plyIndex + 2; // +2 because positions are one ahead of moves

			// Replay to ensure chessPosition is correct
			chessPosition = createInitialPosition();
			for (let i = 0; i <= plyIndex; i++) {
				const uci = moveHistory[i];
				const legal = generateLegalMoves(chessPosition);
				const move = legal.find((m) => moveToUci(m) === uci);
				if (!move) {
					postChess("chess_redraw", { info: "move_not_found" });
					return;
				}
				chessPosition = applyMove(chessPosition, move);
			}

			const status = getGameStatus(chessPosition);
			postChess("chess_redraw", {
				status,
				latestMoveUci: moveHistory[plyIndex] ?? null,
			});

			if (status.terminal) break;

			if (isChessAiTurn()) {
				postChess("chess_ai_to_move", { status });
			} else {
				postChessHumanToMove(status);
			}
			break;
		}

		default:
			break;
	}
});
