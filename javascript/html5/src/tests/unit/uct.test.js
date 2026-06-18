import { describe, expect, it } from "vitest";
import { Uct } from "../../js/uct/uct.js";
import { UctNode } from "../../js/uct/uctnode.js";

const boardStub = (actions, active = 0) => ({
	getActions: () => [...actions],
	active,
	copy() {
		return boardStub(actions, active);
	},
	doAction() {},
	getResult: () => [0.01, 0.01],
});

class TinyDeterministicGame {
	constructor(state = { ply: 0, active: 0, winner: null }) {
		this.state = { ...state };
	}

	get active() {
		return this.state.active;
	}

	copy() {
		return new TinyDeterministicGame(this.state);
	}

	getActions() {
		if (this.state.winner !== null) return [];
		if (this.state.ply === 0) return ["safe", "blunder"];
		if (this.state.ply === 1)
			return this.state.last === "blunder" ? ["punish"] : ["drift"];
		return [];
	}

	doAction(action) {
		if (this.state.winner !== null) return;
		if (this.state.ply === 0) {
			this.state = { ...this.state, ply: 1, last: action, active: 1 };
			return;
		}
		if (this.state.ply === 1) {
			const winner = this.state.last === "blunder" ? 1 : null;
			this.state = { ...this.state, ply: 2, active: 0, winner };
		}
	}

	getResult() {
		if (this.state.winner === 0) return [1, 0];
		if (this.state.winner === 1) return [0, 1];
		if (this.state.ply >= 2) return [0.5, 0.5];
		return [0.01, 0.01];
	}
}

describe("UctNode", () => {
	it("stores action and unexamined moves from board", () => {
		const node = new UctNode(null, boardStub(["a", "b", "c"]), null);
		expect(node.unexamined).toEqual(["a", "b", "c"]);
		expect(node.activePlayer).toBe(0);
	});

	it("adds child and removes action from unexamined list", () => {
		const node = new UctNode(null, boardStub(["x", "y", "z"]), null);
		const child = node.addChild(boardStub([], 1), 1);
		expect(child.action).toBe("y");
		expect(node.unexamined).toEqual(["x", "z"]);
	});

	it("selects child with highest UCB1 value", () => {
		const parent = new UctNode(null, boardStub(["left", "right"]), null);
		parent.visits = 10;

		const c0 = parent.addChild(boardStub([]), 0);
		c0.wins = 8;
		c0.visits = 10;

		const c1 = parent.addChild(boardStub([]), 0);
		c1.wins = 1;
		c1.visits = 1;

		expect(parent.selectChild()).toBe(c1);
	});

	it("returns null when asking mostVisitedChild with no children", () => {
		const node = new UctNode(null, boardStub(["x"]), null);
		expect(node.mostVisitedChild()).toBeNull();
	});

	it("updates wins from parent chooser perspective", () => {
		const parent = new UctNode(null, boardStub(["x"], 1), null);
		const child = parent.addChild(boardStub([], 0), 0);

		child.update([0.2, 0.8]);
		expect(child.visits).toBe(1);
		expect(child.wins).toBeCloseTo(0.8);
	});

	it("keeps first child when visits are tied in mostVisitedChild", () => {
		const parent = new UctNode(null, boardStub(["left", "right"]), null);
		const c0 = parent.addChild(boardStub([]), 0);
		const c1 = parent.addChild(boardStub([]), 0);
		c0.visits = 3;
		c1.visits = 3;

		expect(parent.mostVisitedChild()).toBe(c0);
	});

	it("returns child with greater visits in mostVisitedChild", () => {
		const parent = new UctNode(null, boardStub(["left", "right"]), null);
		const c0 = parent.addChild(boardStub([]), 0);
		const c1 = parent.addChild(boardStub([]), 0);
		c0.visits = 2;
		c1.visits = 5;

		expect(parent.mostVisitedChild()).toBe(c1);
	});
});

describe("Uct.getActionInfo", () => {
	const uct = new Uct();

	it("returns null when no legal action exists", () => {
		const board = boardStub([]);
		const result = uct.getActionInfo(board, 500, 50, 5, 10);
		expect(result.action).toBeNull();
		expect(result.info).toMatch(/no action/i);
	});

	it("returns the only legal action directly", () => {
		const board = boardStub(["only"]);
		const result = uct.getActionInfo(board, 500, 50, 5, 10);
		expect(result.action).toBe("only");
		expect(result.info).toMatch(/1 action/i);
	});

	it("avoids a deterministic blunder in two-ply game", () => {
		const board = new TinyDeterministicGame();
		const result = uct.getActionInfo(board, 6000, 250, 12, 16);
		expect(result.action).toBe("safe");
	});

	it("falls back to first root action when budget prevents expansion", () => {
		const board = boardStub(["a", "b"]);
		const result = uct.getActionInfo(board, 0, 1, 1, 1);
		expect(result.action).toBe("a");
		expect(result.info).toMatch(/fallback action/i);
	});
});
