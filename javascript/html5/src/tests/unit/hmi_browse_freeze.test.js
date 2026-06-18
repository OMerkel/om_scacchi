/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

class MockWorker {
	static instance = null;

	constructor() {
		this.listeners = new Map();
		this.sent = [];
		MockWorker.instance = this;
	}

	postMessage(payload) {
		this.sent.push(payload);
	}

	addEventListener(event, cb) {
		this.listeners.set(event, cb);
	}

	emit(data) {
		const cb = this.listeners.get("message");
		if (cb) cb({ data });
	}
}

const buildDom = () => {
	document.body.innerHTML = `
	<div id="app-header-title"></div>
	<div id="app-header-badge"></div>

	<section id="view-game"></section>
	<section id="view-rules" hidden></section>
	<section id="view-options" hidden></section>
	<section id="view-about" hidden></section>

	<div id="board"></div>

	<details id="fen-card"><summary></summary><div><input id="fen-input" /><button id="btn-fen-apply" type="button">Apply</button><span id="fen-status"></span></div></details>
	<details id="telemetry-card"><summary></summary><div><span id="tel-depth"></span><span id="tel-nodes"></span><span id="tel-score"></span><span id="tel-pv"></span></div></details>
	<details id="info-card"><summary></summary><div><span id="tel-opening"></span></div></details>
	<details id="history-card" open><summary></summary><div id="history-content"><div id="move-history"></div></div></details>

	<div id="promotion-dialog" hidden>
		<button type="button" data-piece="q">Q</button>
		<button type="button" data-piece="r">R</button>
		<button type="button" data-piece="b">B</button>
		<button type="button" data-piece="n">N</button>
	</div>

	<div id="side-panel"></div>
	<button id="btn-menu" type="button">Menu</button>
	<button id="btn-panel-close" type="button">Close</button>
	<div id="panel-overlay" hidden></div>

	<button id="nav-new" type="button">New</button>
	<li id="nav-resume-item" hidden><button id="nav-resume" type="button">Resume</button></li>
	<button id="nav-rules" type="button">Rules</button>
	<button id="nav-options" type="button">Options</button>
	<button id="nav-about" type="button">About</button>
	<button id="btn-options-ok" type="button">OK</button>
	<p id="device-profile-hint"></p>
	<button class="btn-back" type="button">Back</button>

	<label><input type="radio" name="firstplayer" value="Human" />Human</label>
	<label><input type="radio" name="firstplayer" value="AI" checked />AI</label>
	<label><input type="radio" name="secondplayer" value="Human" />Human</label>
	<label><input type="radio" name="secondplayer" value="AI" checked />AI</label>

	<label><input type="radio" name="difficultysouth" value="Easy" />Easy</label>
	<label><input type="radio" name="difficultysouth" value="Medium" checked />Medium</label>
	<label><input type="radio" name="difficultysouth" value="Hard" />Hard</label>
	<label><input type="radio" name="difficultynorth" value="Easy" />Easy</label>
	<label><input type="radio" name="difficultynorth" value="Medium" checked />Medium</label>
	<label><input type="radio" name="difficultynorth" value="Hard" />Hard</label>

	<label><input type="radio" name="deviceprofile" value="Auto" checked />Auto</label>
	<label><input type="radio" name="deviceprofile" value="Desktop" />Desktop</label>
	<label><input type="radio" name="deviceprofile" value="Mobile" />Mobile</label>

	<label><input type="radio" name="chesssettheme" value="Glyph" checked />Glyph</label>
	<label><input type="radio" name="chesssettheme" value="NiceSvg" />NiceSvg</label>
	`;
};

describe("hmi browse freeze", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.useFakeTimers();

		buildDom();

		globalThis.Worker = MockWorker;
		window.matchMedia = vi.fn().mockReturnValue({ matches: false });
		window.innerWidth = 1200;

		vi.doMock("../../js/chess/chess_renderer.js", () => ({
			createChessRenderer: () => ({ render: vi.fn() }),
		}));
		vi.doMock("../../js/chess/position.js", () => ({
			createPositionFromFen: vi.fn(() => ({ sideToMove: "w" })),
		}));
		vi.doMock("../../js/chess/san.js", () => ({
			pvToSan: vi.fn(() => "san"),
		}));
		vi.doMock("../../js/chess/storage.js", () => ({
			loadStorage: vi.fn(() => ({
				settings: {},
				chessFen: "start",
				moveHistory: [
					{ moveNumber: 1, san: "e4", uci: "e2e4" },
					{ moveNumber: 1, san: "e5", uci: "e7e5" },
				],
			})),
			saveStorage: vi.fn(),
		}));
		vi.doMock("../../js/rendering/theme_chess_glyph.js", () => ({
			themeGlyph: {},
		}));
		vi.doMock("../../js/rendering/theme_chess_svg.js", () => ({
			themeSvg: {},
		}));
	});

	it("does not append plies or schedule AI move while browsing history", async () => {
		await import("../../js/hmi.js");
		await flush();

		const worker = MockWorker.instance;
		expect(worker).toBeTruthy();

		const moveItems = () => Array.from(document.querySelectorAll(".move-item"));
		expect(moveItems().length).toBe(2);

		const firstMoveBtn = moveItems()[0];
		firstMoveBtn.click();
		await flush();

		const sentBeforeAiToMove = worker.sent.length;
		worker.emit({
			request: "chess_ai_to_move",
			gameSessionId: 1,
			status: { terminal: false },
		});
		vi.advanceTimersByTime(700);
		await flush();

		const aiActionsAfterBrowse = worker.sent
			.slice(sentBeforeAiToMove)
			.filter((msg) => msg.request === "chess_action_by_ai");
		expect(aiActionsAfterBrowse).toHaveLength(0);

		const beforeLabels = moveItems().map((el) => el.textContent);

		worker.emit({
			request: "chess_redraw",
			gameSessionId: 1,
			chessPosition: { sideToMove: "w" },
			fen: "game-redraw-fen",
			status: { terminal: false },
			latestMoveUci: "a7a6",
		});
		await flush();

		worker.emit({
			request: "chess_redraw",
			gameSessionId: 1,
			isBrowseRedraw: true,
			chessPosition: { sideToMove: "w" },
			fen: "browse-redraw-fen",
			status: { terminal: false },
			latestMoveUci: "a7a6",
		});
		await flush();

		const afterLabels = moveItems().map((el) => el.textContent);
		expect(afterLabels).toEqual(beforeLabels);
		expect(moveItems().length).toBe(2);
	});
});
