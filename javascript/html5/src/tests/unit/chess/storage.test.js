// Copyright (c) 2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearStorage,
	loadStorage,
	saveStorage,
} from "../../../js/chess/storage.js";

// Minimal localStorage mock for Node environment
const store = {};
const mockLocalStorage = {
	getItem: (key) => (Object.hasOwn(store, key) ? store[key] : null),
	setItem: (key, val) => {
		store[key] = String(val);
	},
	removeItem: (key) => {
		delete store[key];
	},
};

beforeEach(() => {
	// Clear backing store and inject mock
	for (const k of Object.keys(store)) delete store[k];
	globalThis.localStorage = mockLocalStorage;
});

afterEach(() => {
	delete globalThis.localStorage;
});

describe("loadStorage", () => {
	it("returns defaults when storage is empty", () => {
		const result = loadStorage();
		expect(result.variant).toBe("chess");
		expect(result.chessFen).toBeNull();
		expect(result.settings).toEqual({});
	});

	it("returns defaults when storage contains invalid JSON", () => {
		store.om_scacchi_v1 = "not-json!!";
		const result = loadStorage();
		expect(result.variant).toBe("chess");
	});

	it("returns defaults when stored value is not an object", () => {
		store.om_scacchi_v1 = JSON.stringify(42);
		const result = loadStorage();
		expect(result.variant).toBe("chess");
	});

	it("merges stored values with defaults", () => {
		store.om_scacchi_v1 = JSON.stringify({
			variant: "checkers",
			chessFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
		});
		const result = loadStorage();
		expect(result.variant).toBe("checkers");
		expect(result.chessFen).toMatch(/^rnbq/);
		expect(result.settings).toEqual({});
	});
});

describe("saveStorage", () => {
	it("persists a value and loadStorage retrieves it", () => {
		saveStorage({ variant: "checkers" });
		const result = loadStorage();
		expect(result.variant).toBe("checkers");
	});

	it("merges multiple saves", () => {
		saveStorage({ variant: "chess" });
		saveStorage({
			chessFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		});
		const result = loadStorage();
		expect(result.variant).toBe("chess");
		expect(result.chessFen).toBeTruthy();
	});

	it("does not throw when localStorage is unavailable", () => {
		delete globalThis.localStorage;
		expect(() => saveStorage({ variant: "chess" })).not.toThrow();
	});
});

describe("clearStorage", () => {
	it("removes all saved data", () => {
		saveStorage({ variant: "checkers" });
		clearStorage();
		const result = loadStorage();
		expect(result.variant).toBe("chess"); // back to default
	});

	it("does not throw when localStorage is unavailable", () => {
		delete globalThis.localStorage;
		expect(() => clearStorage()).not.toThrow();
	});
});

describe("loadStorage (no localStorage)", () => {
	it("returns defaults gracefully when localStorage is absent", () => {
		delete globalThis.localStorage;
		const result = loadStorage();
		expect(result.variant).toBe("chess");
	});
});
