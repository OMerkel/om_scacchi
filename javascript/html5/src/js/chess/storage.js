// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT
//
// Persistent storage for om_scacchi settings and game state (localStorage).
// Falls back silently when localStorage is unavailable (private browsing, etc.).

const STORAGE_KEY = "om_scacchi_v1";

const DEFAULTS = {
	variant: "chess",
	chessFen: null,
	moveHistory: [],
	settings: {},
};

/**
 * Load persisted data. Returns merged defaults on any error.
 * @returns {Object}
 */
export const loadStorage = () => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return { ...DEFAULTS };
		return { ...DEFAULTS, ...parsed };
	} catch {
		return { ...DEFAULTS };
	}
};

/**
 * Merge data into persisted storage.
 * @param {Object} data
 */
export const saveStorage = (data) => {
	try {
		const current = loadStorage();
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...data }));
	} catch {
		// Silently ignore (private browsing, quota exceeded, etc.)
	}
};

/**
 * Remove all persisted storage for this app.
 */
export const clearStorage = () => {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Silently ignore
	}
};
