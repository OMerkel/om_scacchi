//
// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//

import { createChessRenderer } from "./chess/chess_renderer.js";
import { createPositionFromFen } from "./chess/position.js";
import { pvToSan } from "./chess/san.js";
import { loadStorage, saveStorage } from "./chess/storage.js";
import { themeGlyph } from "./rendering/theme_chess_glyph.js";
import { themeSvg } from "./rendering/theme_chess_svg.js";
import { Actions, appReducer, createStore, initialAppState } from "./store.js";

const store = createStore(appReducer, initialAppState);
const engine = new Worker("js/controller.js", { type: "module" });

const sections = ["game", "rules", "options", "about"];

let chessRenderer = null;
let selectedChessSquare = null;
let pendingPromotion = null;
let aiMoveTimer = null;
let activeGameSessionId = 1;

const showView = (view) => {
	sections.forEach((id) => {
		const el = document.getElementById(`view-${id}`);
		if (el) el.hidden = id !== view;
	});
	document.getElementById("app-header-title").textContent =
		view === "game"
			? "om_scacchi"
			: view.charAt(0).toUpperCase() + view.slice(1);
};

const updateDifficultyBadge = (
	playerSouth,
	playerNorth,
	difficultySouth,
	difficultyNorth,
	resolvedDeviceProfile,
) => {
	const badge = document.getElementById("app-header-badge");
	if (!badge) return;
	const south =
		(playerSouth ?? "Human") === "Human"
			? "human"
			: (difficultySouth ?? "Medium");
	const north =
		(playerNorth ?? "Human") === "Human"
			? "human"
			: (difficultyNorth ?? "Medium");
	const profile = resolvedDeviceProfile ?? "Desktop";
	badge.textContent = `W ${south} | B ${north} | ${profile}`;
};

const detectAutoDeviceProfile = () => {
	const smallViewport = (window.innerWidth || 1200) <= 900;
	const coarsePointer =
		window.matchMedia?.("(pointer: coarse)").matches ?? false;
	return smallViewport || coarsePointer ? "Mobile" : "Desktop";
};

const updateAutoProfileHint = () => {
	const hint = document.getElementById("device-profile-hint");
	if (!hint) return;
	hint.textContent = `Auto currently resolves to ${detectAutoDeviceProfile()}.`;
};

const readSettings = () => ({
	playersouth:
		document.querySelector('input[name="firstplayer"]:checked')?.value ??
		"Human",
	playernorth:
		document.querySelector('input[name="secondplayer"]:checked')?.value ??
		"Human",
	difficultysouth:
		document.querySelector('input[name="difficultysouth"]:checked')?.value ??
		"Medium",
	difficultynorth:
		document.querySelector('input[name="difficultynorth"]:checked')?.value ??
		"Medium",
	deviceprofile:
		document.querySelector('input[name="deviceprofile"]:checked')?.value ??
		"Auto",
	chesssettheme:
		document.querySelector('input[name="chesssettheme"]:checked')?.value ??
		"Glyph",
	resolveddeviceprofile: (() => {
		const selected =
			document.querySelector('input[name="deviceprofile"]:checked')?.value ??
			"Auto";
		return selected === "Auto" ? detectAutoDeviceProfile() : selected;
	})(),
});

const setRadioValue = (name, value) => {
	if (typeof value !== "string" || value.length === 0) return;
	const input = document.querySelector(
		`input[name="${name}"][value="${value}"]`,
	);
	if (input) input.checked = true;
};

const normalizeStoredSettings = (raw) => {
	if (!raw || typeof raw !== "object") return null;
	return {
		playersouth: raw.playersouth ?? raw.playerSouth,
		playernorth: raw.playernorth ?? raw.playerNorth,
		difficultysouth: raw.difficultysouth ?? raw.difficultySouth,
		difficultynorth: raw.difficultynorth ?? raw.difficultyNorth,
		deviceprofile: raw.deviceprofile ?? raw.deviceProfile,
		chesssettheme: raw.chesssettheme ?? raw.chessSetTheme ?? "Glyph",
	};
};

const applySettingsToOptionsForm = (settings) => {
	if (!settings) return;
	setRadioValue("firstplayer", settings.playersouth);
	setRadioValue("secondplayer", settings.playernorth);
	setRadioValue("difficultysouth", settings.difficultysouth);
	setRadioValue("difficultynorth", settings.difficultynorth);
	setRadioValue("deviceprofile", settings.deviceprofile);
	setRadioValue("chesssettheme", settings.chesssettheme);
};

const sendToEngine = (request, extra = {}) => {
	engine.postMessage({
		class: "request",
		request,
		gameSessionId: activeGameSessionId,
		settings: readSettings(),
		...extra,
	});
};

const renderChessBoard = () => {
	const state = store.getState();
	if (!chessRenderer || !state.chessPosition) return;
	chessRenderer.render({
		position: state.chessPosition,
		legalMoves: state.chessLegalMoves,
		selectedSquare: selectedChessSquare,
		lastMoveUci: state.chessLastMoveUci,
		evalScore: state.chessEvalScore,
		status: state.chessStatus,
	});
};

const updateFenCard = (fen) => {
	const input = document.getElementById("fen-input");
	if (input && fen && document.activeElement !== input) {
		input.value = fen;
	}
};

const updateInfoCard = (openingName) => {
	const opening = document.getElementById("tel-opening");
	if (!opening) return;
	opening.textContent =
		typeof openingName === "string" && openingName ? openingName : "-";
};

const updateTelemetryCard = (telemetry, position) => {
	if (!telemetry) return;
	const byId = (id) => document.getElementById(id);
	const depth = byId("tel-depth");
	const nodes = byId("tel-nodes");
	const score = byId("tel-score");
	const pv = byId("tel-pv");
	if (depth) depth.textContent = String(telemetry.depth ?? "-");
	if (nodes)
		nodes.textContent =
			telemetry.nodes != null ? telemetry.nodes.toLocaleString() : "-";
	if (score) {
		if (telemetry.score != null) {
			const pawns = (telemetry.score / 100).toFixed(2);
			score.textContent = telemetry.score > 0 ? `+${pawns}` : `${pawns}`;
		} else {
			score.textContent = "-";
		}
	}
	if (pv) {
		const pvPosition = (() => {
			if (typeof telemetry.pvStartFen !== "string" || !telemetry.pvStartFen) {
				return position;
			}
			try {
				return createPositionFromFen(telemetry.pvStartFen);
			} catch {
				return position;
			}
		})();
		const san =
			pvPosition && telemetry.pv ? pvToSan(pvPosition, telemetry.pv) : "";
		pv.textContent = san || telemetry.bestMove || "-";
	}
};

const updateMoveHistory = (moveHistory) => {
	const historyDiv = document.getElementById("move-history");
	if (!historyDiv) return;

	if (moveHistory.length === 0) {
		historyDiv.textContent = "No moves yet.";
		return;
	}

	historyDiv.innerHTML = "";
	let currentNumber = 1;

	for (let i = 0; i < moveHistory.length; i++) {
		const move = moveHistory[i];

		if (i % 2 === 0) {
			const numberSpan = document.createElement("span");
			numberSpan.className = "move-number";
			numberSpan.textContent = `${currentNumber}.`;
			historyDiv.appendChild(numberSpan);
			currentNumber++;
		}

		const moveBtn = document.createElement("button");
		moveBtn.className = "move-item";
		moveBtn.type = "button";
		moveBtn.textContent = move.san || move.uci;
		moveBtn.dataset.plyIndex = String(i);
		moveBtn.dataset.moveUci = move.uci;
		moveBtn.addEventListener("click", () => {
			store.dispatch({
				type: Actions.ENTER_BROWSE_MODE,
				plyIndex: i,
			});
			sendToEngine("chess_browse_to_ply", { plyIndex: i });
		});
		historyDiv.appendChild(moveBtn);
	}
};

const handleChessSquareClick = (square) => {
	const state = store.getState();
	if (state.phase !== "human_turn") return;
	const legalMoves = state.chessLegalMoves;
	if (!legalMoves.length) return;

	const candidateMoves = selectedChessSquare
		? legalMoves.filter(
				(m) =>
					m.from.row === selectedChessSquare.row &&
					m.from.col === selectedChessSquare.col &&
					m.to.row === square.row &&
					m.to.col === square.col,
			)
		: [];

	if (candidateMoves.length > 0) {
		if (
			candidateMoves.length > 1 &&
			candidateMoves.every((m) => m.flags?.promotion)
		) {
			pendingPromotion = candidateMoves;
			const dlg = document.getElementById("promotion-dialog");
			if (dlg) dlg.hidden = false;
			return;
		}
		selectedChessSquare = null;
		sendToEngine("chess_move", { action: candidateMoves[0] });
		renderChessBoard();
		return;
	}

	const isOrigin = legalMoves.some(
		(m) => m.from.row === square.row && m.from.col === square.col,
	);
	selectedChessSquare = isOrigin ? square : null;
	renderChessBoard();
};

engine.addEventListener("message", ({ data }) => {
	if (
		typeof data.gameSessionId === "number" &&
		data.gameSessionId !== activeGameSessionId
	) {
		return;
	}

	switch (data.request) {
		case "chess_redraw": {
			const telemetry = data.engineInfo ?? null;
			const state = store.getState();
			const isBrowseRedraw = data.isBrowseRedraw === true;

			// During browse mode, ignore game play updates; only respond to browse_to_ply redraws
			// (browse redraws have a specific data structure from chess_browse_to_ply)
			if (state.uiMode === "browse" && !isBrowseRedraw) {
				break;
			}

			store.dispatch({
				type: Actions.CHESS_POSITION_UPDATE,
				chessPosition: data.chessPosition,
				fen: data.fen,
				status: data.status,
				telemetry,
				openingName: data.openingName,
				evalScore: telemetry?.score ?? null,
				lastMoveUci: data.latestMoveUci ?? null,
			});

			// Only real game redraws are allowed to mutate move history.
			if (
				!isBrowseRedraw &&
				data.latestMoveUci &&
				state.chessLastMoveUci !== data.latestMoveUci
			) {
				const prevPosition =
					state.moveHistory.length > 0 ? state.chessPosition : null;
				const moveNumber = Math.floor(state.moveHistory.length / 2) + 1;
				const san = prevPosition
					? pvToSan(prevPosition, [data.latestMoveUci])
					: data.latestMoveUci;

				store.dispatch({
					type: Actions.CHESS_MOVE_ADDED,
					move: { moveNumber, san, uci: data.latestMoveUci },
				});
			}

			if (!isBrowseRedraw && data.fen) {
				saveStorage({ chessFen: data.fen });
			}
			break;
		}

		case "chess_human_to_move": {
			if (aiMoveTimer !== null) {
				clearTimeout(aiMoveTimer);
				aiMoveTimer = null;
			}
			selectedChessSquare = null;
			store.dispatch({
				type: Actions.CHESS_HUMAN_TURN,
				chessPosition: data.chessPosition,
				fen: data.fen,
				status: data.status,
				legalMoves: data.legalMoves ?? [],
				lastMoveUci: data.latestMoveUci ?? null,
			});
			break;
		}

		case "chess_ai_to_move": {
			selectedChessSquare = null;
			const state = store.getState();
			// If browsing history, suppress auto-play; resume from browse mode will trigger move
			if (state.uiMode === "browse") {
				break;
			}
			store.dispatch({ type: Actions.CHESS_AI_THINKING });
			if (aiMoveTimer !== null) clearTimeout(aiMoveTimer);
			aiMoveTimer = setTimeout(() => {
				aiMoveTimer = null;
				sendToEngine("chess_action_by_ai");
			}, 600);
			break;
		}

		default:
			break;
	}
});

store.subscribe((state) => {
	showView(state.view);
	updateDifficultyBadge(
		state.settings.playerSouth,
		state.settings.playerNorth,
		state.settings.difficultySouth,
		state.settings.difficultyNorth,
		state.settings.resolvedDeviceProfile,
	);

	// Persist game state (FEN and move history)
	saveStorage({ chessFen: state.chessFen, moveHistory: state.moveHistory });

	// Update Resume button visibility
	const resumeItem = document.getElementById("nav-resume-item");
	if (resumeItem) {
		resumeItem.hidden = state.uiMode !== "browse";
	}

	// Cancel any pending AI move when entering browse mode
	if (state.uiMode === "browse" && aiMoveTimer !== null) {
		clearTimeout(aiMoveTimer);
		aiMoveTimer = null;
	}

	if (chessRenderer && state.chessPosition) {
		if (state.phase !== "human_turn") selectedChessSquare = null;
		renderChessBoard();
	}
	updateFenCard(state.chessFen);
	updateInfoCard(state.chessOpeningName);
	if (state.chessTelemetry) {
		updateTelemetryCard(state.chessTelemetry, state.chessPosition);
	} else if (state.uiMode === "browse") {
		// Clear telemetry in browse mode
		document.querySelectorAll("#telemetry-card [id^='tel-']").forEach((el) => {
			el.textContent = "–";
		});
	}

	// Update move history (recreates DOM elements)
	updateMoveHistory(state.moveHistory);

	// Highlight selected ply AFTER move history is updated
	if (state.uiMode === "browse" && state.selectedPlyIndex != null) {
		document.querySelectorAll(".move-item").forEach((item, idx) => {
			if (idx === state.selectedPlyIndex) {
				item.classList.add("selected");
			} else {
				item.classList.remove("selected");
			}
		});
	} else {
		document.querySelectorAll(".move-item").forEach((item) => {
			item.classList.remove("selected");
		});
	}

	if (state.phase === "ai_thinking") {
		document.getElementById("app-header-title").textContent = "AI thinking...";
	}
});

const getTheme = (themeName) => {
	switch (themeName) {
		case "NiceSvg":
			return themeSvg;
		default:
			return themeGlyph;
	}
};

const recreateRenderer = () => {
	const state = store.getState();
	const boardContainer = document.getElementById("board");
	if (boardContainer) {
		boardContainer.innerHTML = "";
		const theme = getTheme(state.settings.chessSetTheme);
		chessRenderer = createChessRenderer(
			boardContainer,
			handleChessSquareClick,
			theme,
		);
		renderChessBoard();
	}
};

const wireUI = () => {
	const panel = document.getElementById("side-panel");
	const menuBtn = document.getElementById("btn-menu");
	const closeBtn = document.getElementById("btn-panel-close");
	const overlay = document.getElementById("panel-overlay");

	const openPanel = () => {
		panel.classList.add("open");
		overlay.hidden = false;
	};
	const closePanel = () => {
		panel.classList.remove("open");
		overlay.hidden = true;
	};

	const applySettingsFromOptions = () => {
		const s = readSettings();
		const oldTheme = store.getState().settings.chessSetTheme;
		const newTheme = s.chesssettheme;
		const themeChanged = oldTheme !== newTheme;

		saveStorage({ settings: s });
		store.dispatch({
			type: Actions.SETTINGS_CHANGE,
			settings: {
				playerSouth: s.playersouth,
				playerNorth: s.playernorth,
				difficultySouth: s.difficultysouth,
				difficultyNorth: s.difficultynorth,
				deviceProfile: s.deviceprofile,
				chessSetTheme: s.chesssettheme,
				resolvedDeviceProfile: s.resolveddeviceprofile,
			},
		});

		// Recreate renderer if theme changed
		if (themeChanged) {
			recreateRenderer();
		}

		sendToEngine("sync");
	};

	const closePanelAndReturnToGame = () => {
		closePanel();
		const currentView = store.getState().view;
		if (currentView === "options") {
			applySettingsFromOptions();
			store.dispatch({ type: Actions.NAVIGATE, view: "game" });
			return;
		}
		if (currentView === "rules" || currentView === "about") {
			store.dispatch({ type: Actions.NAVIGATE, view: "game" });
		}
	};

	menuBtn?.addEventListener("click", openPanel);
	closeBtn?.addEventListener("click", closePanelAndReturnToGame);
	overlay?.addEventListener("click", closePanelAndReturnToGame);

	document.getElementById("nav-new")?.addEventListener("click", () => {
		if (store.getState().view === "options") applySettingsFromOptions();
		closePanel();
		if (aiMoveTimer !== null) {
			clearTimeout(aiMoveTimer);
			aiMoveTimer = null;
		}
		activeGameSessionId += 1;
		// Exit browse mode when starting new game
		store.dispatch({ type: Actions.EXIT_BROWSE_MODE });
		store.dispatch({ type: Actions.NAVIGATE, view: "game" });
		store.dispatch({ type: Actions.NEW_GAME });
		// Start new game without move history (no moveHistory passed)
		sendToEngine("chess_start");
	});

	document.getElementById("nav-resume")?.addEventListener("click", () => {
		const state = store.getState();
		// Apply current Options settings before resuming
		applySettingsFromOptions();
		// Truncate move history to selected ply (delete all unplayed moves after cursor)
		store.dispatch({
			type: Actions.TRUNCATE_MOVE_HISTORY,
			plyIndex: state.selectedPlyIndex,
		});
		closePanel();
		store.dispatch({ type: Actions.EXIT_BROWSE_MODE });
		// Resume game from selected ply with updated settings
		sendToEngine("chess_continue_from_browse", {
			plyIndex: state.selectedPlyIndex,
		});
	});

	const navTo = (view) => () => {
		closePanel();
		store.dispatch({ type: Actions.NAVIGATE, view });
	};
	document
		.getElementById("nav-rules")
		?.addEventListener("click", navTo("rules"));
	document.getElementById("nav-options")?.addEventListener("click", () => {
		navTo("options")();
		updateAutoProfileHint();
	});
	document
		.getElementById("nav-about")
		?.addEventListener("click", navTo("about"));

	document.querySelectorAll(".btn-back").forEach((btn) => {
		btn.addEventListener("click", () =>
			store.dispatch({ type: Actions.NAVIGATE, view: "game" }),
		);
	});

	document.getElementById("btn-options-ok")?.addEventListener("click", () => {
		applySettingsFromOptions();
		store.dispatch({ type: Actions.NAVIGATE, view: "game" });
	});

	document.querySelectorAll('input[name="deviceprofile"]').forEach((input) => {
		input.addEventListener("change", updateAutoProfileHint);
	});
	window.addEventListener("resize", updateAutoProfileHint);

	const saved = loadStorage();
	applySettingsToOptionsForm(normalizeStoredSettings(saved.settings));

	const initialSettings = readSettings();
	store.dispatch({
		type: Actions.SETTINGS_CHANGE,
		settings: {
			playerSouth: initialSettings.playersouth,
			playerNorth: initialSettings.playernorth,
			difficultySouth: initialSettings.difficultysouth,
			difficultyNorth: initialSettings.difficultynorth,
			deviceProfile: initialSettings.deviceprofile,
			chessSetTheme: initialSettings.chesssettheme,
			resolvedDeviceProfile: initialSettings.resolveddeviceprofile,
		},
	});

	// Restore move history from saved game state
	if (Array.isArray(saved.moveHistory) && saved.moveHistory.length > 0) {
		for (const move of saved.moveHistory) {
			store.dispatch({
				type: Actions.CHESS_MOVE_ADDED,
				move,
			});
		}
	}
	recreateRenderer();

	const fenInput = document.getElementById("fen-input");
	const fenApply = document.getElementById("btn-fen-apply");
	const fenStatus = document.getElementById("fen-status");
	const applyFen = () => {
		const fen = fenInput?.value?.trim();
		if (!fen) return;
		try {
			createPositionFromFen(fen);
			if (fenStatus) fenStatus.textContent = "";
			// Start fresh from custom FEN with no move history
			sendToEngine("chess_start", { fen, moveHistory: [] });
		} catch (err) {
			if (fenStatus) fenStatus.textContent = `Invalid FEN: ${err.message}`;
		}
	};
	fenApply?.addEventListener("click", applyFen);
	fenInput?.addEventListener("keydown", (e) => {
		if (e.key === "Enter") applyFen();
	});

	document.querySelectorAll("#promotion-dialog [data-piece]").forEach((btn) => {
		btn.addEventListener("click", () => {
			const piece = btn.dataset.piece;
			const dlg = document.getElementById("promotion-dialog");
			if (dlg) dlg.hidden = true;
			if (!pendingPromotion) return;
			const chosen = pendingPromotion.find((m) => m.flags.promotion === piece);
			pendingPromotion = null;
			selectedChessSquare = null;
			if (chosen) sendToEngine("chess_move", { action: chosen });
		});
	});

	updateAutoProfileHint();
	// Restore game with saved FEN and move history
	sendToEngine("chess_start", {
		fen: saved.chessFen || undefined,
		moveHistory: saved.moveHistory || [],
	});
};

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", wireUI);
} else {
	wireUI();
}
