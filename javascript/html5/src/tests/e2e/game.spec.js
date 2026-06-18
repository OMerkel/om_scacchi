import { expect, test } from "@playwright/test";

const clickCell = async (page, row, col) => {
	const clicked = await page.evaluate(
		({ r, c }) => {
			const overlays = [
				...document.querySelectorAll("#board svg rect[data-row][data-col]"),
			];
			const target = overlays.find(
				(el) => Number(el.dataset.row) === r && Number(el.dataset.col) === c,
			);
			if (!target || target.style.cursor !== "pointer") return false;
			target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return true;
		},
		{ r: row, c: col },
	);

	if (!clicked) throw new Error(`Cell ${row},${col} is not clickable`);
};

const waitForHumanTurn = (page) =>
	page.waitForFunction(
		() => {
			const overlays = [
				...document.querySelectorAll("#board svg rect[data-row][data-col]"),
			];
			return overlays.some((el) => el.style.cursor === "pointer");
		},
		{ timeout: 30_000 },
	);

const pieceAt = (page, row, col) =>
	page.evaluate(
		({ r, c }) => {
			// For chess board, pieces are text elements within the SVG
			// Get all text elements and find the one at the expected position
			const allTexts = [...document.querySelectorAll("#board svg text")];

			// Expected center of square (row, col)
			// Based on chess_renderer.js: BOARD_OFFSET_X=52, BOARD_OFFSET_Y=56, CELL=90
			const BOARD_OFFSET_X = 52;
			const BOARD_OFFSET_Y = 56;
			const CELL = 90;
			const expectedX = BOARD_OFFSET_X + c * CELL + CELL / 2;
			const expectedY = BOARD_OFFSET_Y + r * CELL + CELL * 0.73;

			// Find text element closest to expected position
			let closest = null;
			let minDist = 30; // tolerance
			for (const text of allTexts) {
				const x = Number(text.getAttribute("x"));
				const y = Number(text.getAttribute("y"));
				const dist = Math.sqrt((x - expectedX) ** 2 + (y - expectedY) ** 2);
				if (dist < minDist) {
					minDist = dist;
					closest = text.textContent;
				}
			}
			if (closest) return closest;
			return null;
		},
		{ r: row, c: col },
	);

const expectOnlyViewVisible = async (page, visibleViewId) => {
	const viewIds = ["view-game", "view-rules", "view-options", "view-about"];
	const hiddenById = await page.evaluate((ids) => {
		const state = {};
		for (const id of ids) {
			const el = document.getElementById(id);
			state[id] = el ? el.hidden : null;
		}
		return state;
	}, viewIds);

	for (const id of viewIds) {
		const selector = `#${id}`;
		if (selector === visibleViewId) {
			expect(hiddenById[id]).toBe(false);
		} else {
			expect(hiddenById[id]).toBe(true);
		}
	}
};

test.describe("Page load", () => {
	test("title is correct", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/om_scacchi/i);
	});

	test("game view and board are visible", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("#view-game")).toBeVisible();
		await expect(page.locator("#board svg")).toBeVisible();
		await expect(page.locator("#app-header-title")).toHaveText("om_scacchi");
	});
});

test.describe("Navigation and options", () => {
	test("rules, options and about views open", async ({ page }) => {
		await page.goto("/");
		await expectOnlyViewVisible(page, "#view-game");

		await page.locator("#btn-menu").click();
		await page.locator("#nav-rules").click();
		await expectOnlyViewVisible(page, "#view-rules");

		await page.locator("#btn-menu").click();
		await page.locator("#nav-options").click();
		await expectOnlyViewVisible(page, "#view-options");

		await page.locator("#btn-menu").click();
		await page.locator("#nav-about").click();
		await expectOnlyViewVisible(page, "#view-about");
	});

	test("close and back return to board display", async ({ page }) => {
		await page.goto("/");

		await page.locator("#btn-menu").click();
		await page.locator("#nav-rules").click();
		await expectOnlyViewVisible(page, "#view-rules");
		await page.locator("#view-rules .btn-back").click();
		await expectOnlyViewVisible(page, "#view-game");

		await page.locator("#btn-menu").click();
		await page.locator("#nav-options").click();
		await expectOnlyViewVisible(page, "#view-options");
		await page.locator("#btn-menu").click();
		await page.locator("#btn-panel-close").click();
		await expectOnlyViewVisible(page, "#view-game");

		await page.locator("#btn-menu").click();
		await page.locator("#nav-about").click();
		await expectOnlyViewVisible(page, "#view-about");
		await page.locator("#btn-menu").click();
		await page.locator("#panel-overlay").click();
		await expectOnlyViewVisible(page, "#view-game");
	});

	test("options update badge with player types", async ({ page }) => {
		await page.goto("/");
		await page.locator("#btn-menu").click();
		await page.locator("#nav-options").click();

		await page.locator('input[name="firstplayer"][value="AI"]').check();
		await page.locator('input[name="secondplayer"][value="Human"]').check();
		await page.locator('input[name="difficultysouth"][value="Hard"]').check();
		await page.locator("#btn-options-ok").click();

		await expect(page.locator("#app-header-badge")).toContainText("W Hard");
		await expect(page.locator("#app-header-badge")).toContainText("B human");
	});
});

test.describe("Board interaction", () => {
	test("human can select and move opening piece", async ({ page }) => {
		await page.goto("/");
		await waitForHumanTurn(page);

		// In chess starting position, white pawns are at row 6 (rank 2)
		// Move a pawn from row 6, col 4 (e2) to row 5, col 4 (e3)
		await clickCell(page, 6, 4);
		await clickCell(page, 5, 4);

		await expect.poll(async () => pieceAt(page, 6, 4)).toBeNull();
		await expect.poll(async () => pieceAt(page, 5, 4)).toContain("♙");
	});

	test("new game resets opening position", async ({ page }) => {
		await page.goto("/");
		await waitForHumanTurn(page);

		// Make a pawn move from e2 to e3
		await clickCell(page, 6, 4);
		await clickCell(page, 5, 4);

		await page.locator("#btn-menu").click();
		await page.locator("#nav-new").click();
		await waitForHumanTurn(page);

		// After new game, pawn should be back at e2
		await expect.poll(async () => pieceAt(page, 6, 4)).toContain("♙");
		await expect.poll(async () => pieceAt(page, 5, 4)).toBeNull();
	});
});

test.describe("Accessibility", () => {
	test("board svg has om_scacchi aria label", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("#board svg")).toHaveAttribute(
			"aria-label",
			/om_scacchi/i,
		);
	});
});
