// Copyright (c) 2016,2026 Oliver Merkel. All rights reserved.
// SPDX-License-Identifier: MIT

const makeCompositeKey = (positionKey, sideToMove) =>
	`${positionKey} ${sideToMove}`;

export const createTranspositionTable = (maxEntries = 20000) => {
	if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
		throw new Error("Transposition table size must be a positive integer");
	}

	let clock = 0;
	const table = new Map();

	const evictIfNeeded = () => {
		if (table.size <= maxEntries) return;

		let oldestKey = null;
		let oldestAge = Number.POSITIVE_INFINITY;
		for (const [key, value] of table.entries()) {
			if (value.age < oldestAge) {
				oldestAge = value.age;
				oldestKey = key;
			}
		}
		if (oldestKey !== null) table.delete(oldestKey);
	};

	return {
		size: () => table.size,

		clear: () => {
			table.clear();
			clock = 0;
		},

		get: (positionKey, sideToMove) => {
			const compositeKey = makeCompositeKey(positionKey, sideToMove);
			return table.get(compositeKey) ?? null;
		},

		set: (positionKey, sideToMove, entry) => {
			const compositeKey = makeCompositeKey(positionKey, sideToMove);
			const current = table.get(compositeKey);

			if (current && current.depth > entry.depth) {
				return current;
			}

			const normalized = {
				depth: entry.depth,
				score: entry.score,
				flag: entry.flag,
				bestMoveUci: entry.bestMoveUci ?? null,
				age: ++clock,
			};

			table.set(compositeKey, normalized);
			evictIfNeeded();
			return normalized;
		},
	};
};
