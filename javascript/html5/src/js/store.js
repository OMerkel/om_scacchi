// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Minimal reactive store inspired by the Redux pattern.
// State transitions are pure (reducer function); side-effects happen in
// subscribers.  The store is the single source of truth for the UI layer.

/**
 * Create a reactive store.
 *
 * @template S
 * @param {(state: S, action: Object) => S} reducer  - Pure state-transition function.
 * @param {S} initialState                           - Starting state.
 * @returns {{ getState, dispatch, subscribe }}
 */
export const createStore = (reducer, initialState) => {
	let state = initialState;
	const listeners = new Set();

	const getState = () => state;

	const dispatch = (action) => {
		state = reducer(state, action);
		listeners.forEach((fn) => {
			fn(state, action);
		});
	};

	/** Subscribe to every state change.  Returns an unsubscribe function. */
	const subscribe = (fn) => {
		listeners.add(fn);
		return () => listeners.delete(fn);
	};

	return { getState, dispatch, subscribe };
};

// ---------------------------------------------------------------------------
// Action type constants
// ---------------------------------------------------------------------------

export const Actions = Object.freeze({
	NAVIGATE: "NAVIGATE",
	SETTINGS_CHANGE: "SETTINGS_CHANGE",
	NEW_GAME: "NEW_GAME",
	CHESS_POSITION_UPDATE: "CHESS_POSITION_UPDATE",
	CHESS_HUMAN_TURN: "CHESS_HUMAN_TURN",
	CHESS_AI_THINKING: "CHESS_AI_THINKING",
	CHESS_MOVE_ADDED: "CHESS_MOVE_ADDED",
	ENTER_BROWSE_MODE: "ENTER_BROWSE_MODE",
	EXIT_BROWSE_MODE: "EXIT_BROWSE_MODE",
	SET_SELECTED_PLY: "SET_SELECTED_PLY",
	TRUNCATE_MOVE_HISTORY: "TRUNCATE_MOVE_HISTORY",
	SET_MOVE_HISTORY: "SET_MOVE_HISTORY",
});

// ---------------------------------------------------------------------------
// Application reducer
// ---------------------------------------------------------------------------

/**
 * Initial application state.
 * `board` is the raw board-state plain-object received from the worker.
 */
export const initialAppState = {
	view: "game", // 'game' | 'rules' | 'options' | 'about'
	uiMode: "game", // 'game' | 'browse' (within game view)
	selectedPlyIndex: null, // ply index when in browse mode
	chessPosition: null,
	chessFen: null,
	chessLegalMoves: [],
	chessStatus: null,
	chessTelemetry: null,
	chessOpeningName: null,
	chessEvalScore: 0,
	chessLastMoveUci: null,
	moveHistory: [], // array of { moveNumber, san, uci }
	phase: "idle", // 'idle' | 'human_turn' | 'ai_thinking'
	settings: {
		playerSouth: "Human",
		playerNorth: "Human",
		difficultySouth: "Medium",
		difficultyNorth: "Medium",
		deviceProfile: "Auto",
		resolvedDeviceProfile: "Desktop",
		chessSetTheme: "Glyph", // 'Glyph' | 'NiceSvg'
	},
};

export const appReducer = (state, action) => {
	switch (action.type) {
		case Actions.NAVIGATE:
			return { ...state, view: action.view };

		case Actions.SETTINGS_CHANGE:
			return {
				...state,
				settings: { ...state.settings, ...action.settings },
			};

		case Actions.CHESS_POSITION_UPDATE:
			return {
				...state,
				chessPosition: action.chessPosition ?? state.chessPosition,
				chessFen: action.fen ?? state.chessFen,
				chessStatus: action.status ?? state.chessStatus,
				chessLegalMoves: [],
				chessTelemetry: action.telemetry ?? state.chessTelemetry,
				chessOpeningName:
					action.openingName === undefined
						? state.chessOpeningName
						: action.openingName,
				chessEvalScore: action.evalScore ?? state.chessEvalScore,
				chessLastMoveUci:
					action.lastMoveUci === undefined
						? state.chessLastMoveUci
						: action.lastMoveUci,
				phase: "idle",
			};

		case Actions.CHESS_HUMAN_TURN:
			return {
				...state,
				chessPosition: action.chessPosition ?? state.chessPosition,
				chessFen: action.fen ?? state.chessFen,
				chessStatus: action.status ?? state.chessStatus,
				chessLegalMoves: action.legalMoves ?? [],
				chessLastMoveUci:
					action.lastMoveUci === undefined
						? state.chessLastMoveUci
						: action.lastMoveUci,
				phase: "human_turn",
			};

		case Actions.CHESS_AI_THINKING:
			return { ...state, phase: "ai_thinking" };

		case Actions.NEW_GAME:
			return {
				...state,
				phase: "idle",
				moveHistory: [],
				chessLastMoveUci: null,
				chessFen: null,
				chessPosition: null,
				chessStatus: null,
			};

		case Actions.CHESS_MOVE_ADDED:
			return {
				...state,
				moveHistory: [...state.moveHistory, action.move],
			};

		case Actions.ENTER_BROWSE_MODE:
			return {
				...state,
				uiMode: "browse",
				selectedPlyIndex: action.plyIndex ?? 0,
				phase: "idle",
				chessLegalMoves: [],
				chessTelemetry: null,
			};

		case Actions.EXIT_BROWSE_MODE:
			return {
				...state,
				uiMode: "game",
				selectedPlyIndex: null,
			};

		case Actions.SET_SELECTED_PLY:
			return {
				...state,
				selectedPlyIndex: action.plyIndex,
			};

		case Actions.TRUNCATE_MOVE_HISTORY:
			return {
				...state,
				moveHistory: state.moveHistory.slice(0, action.plyIndex + 1),
			};

		case Actions.SET_MOVE_HISTORY:
			return {
				...state,
				moveHistory: action.moveHistory ?? [],
			};

		default:
			return state;
	}
};
