# Requirements

> Scope: HMI / UI requirements for **om_scacchi** browser chess application.  
> Derived from the current implementation as of 2026-06-19.

## Motivation

### Purpose

This document specifies the complete set of user-facing requirements for **om_scacchi**, a browser-based chess application with AI opponents. The requirements capture the current implemented behaviour of the HMI (Human-Machine Interface) and UI layer, serving as:

- A **specification baseline** for the application's feature set and user interactions
- **Traceability** linking implemented functionality back to formal requirements
- **Acceptance criteria** for testing and quality assurance
- A **reference guide** for developers maintaining or extending the application

The focus is exclusively on the **HMI/UI layer**, excluding engine/chess logic that is governed by separate technical specifications.

## Overview

### Document Structure

This document is organized into two main sections:

1. **Functional Requirements (FR)** — User-visible features, interactions, and system behaviour
   - FR-NAV: Multi-view navigation and side panel controls
   - FR-BOARD: Chess board rendering, piece interaction, and move execution
   - FR-HIST: Move history display, browsing, and notation
   - FR-FEN: Custom FEN input, validation, and game resumption
   - FR-ENG: AI search metrics and telemetry display
   - FR-INFO: Opening database information display
   - FR-OPT: User-configurable settings (player types, difficulty, theme, device profile)
   - FR-GAME: Game flow, AI behaviour, and terminal conditions
   - FR-PERS: Data persistence via browser storage
   - FR-PWA: Progressive Web App capabilities

2. **Non-Functional Requirements (NFR)** — Quality attributes and system properties
   - NFR-LAYOUT: Page scrolling, panel layout, and no overflow clipping
   - NFR-ACC: Accessibility (ARIA labels, live regions, semantic HTML)
   - NFR-PERF: Performance (Web Workers, asynchronous operations)
   - NFR-ARCH: Architecture principles (Redux store, no external libraries, ES modules)

Each requirement is assigned a unique identifier in the format `<CATEGORY>-<NUMBER>` (e.g., `FR-HIST-05`, `NFR-ACC-02`) to enable precise traceability and discussion. Requirements are numbered sequentially within each category to support easy reference and revision tracking.

---

## 1. Functional Requirements

### FR-NAV — Navigation & View Management

| ID | Requirement |
| --- | --- |
| FR-NAV-01 | The application shall present four named views: **Game**, **Rules**, **Options**, and **About**. |
| FR-NAV-02 | Only one view shall be visible at a time; all others shall be hidden. |
| FR-NAV-03 | A hamburger menu button in the header shall open a slide-in side panel containing navigation links to all views. |
| FR-NAV-04 | The side panel shall be dismissible by clicking a Close button, clicking the overlay behind the panel, or navigating to another view. |
| FR-NAV-05 | The application header title shall display `"om_scacchi"` when the Game view is active and the capitalised view name otherwise. |
| FR-NAV-06 | The Rules and About views shall each contain a **← Back** button that returns to the Game view. |
| FR-NAV-07 | Navigating away from the Options view (via Close, OK, or New Game) shall apply the current option selections before returning. |

---

### FR-BOARD — Chess Board Display & Interaction

| ID | Requirement |
| --- | --- |
| FR-BOARD-01 | The chess board shall be rendered as an 8×8 grid of squares using the active chess-set theme. |
| FR-BOARD-02 | The board shall visually distinguish light squares from dark squares. |
| FR-BOARD-03 | Chess pieces shall be rendered using either the **Glyph** theme (Unicode glyphs) or the **Nice SVG** theme, as selected in Options. |
| FR-BOARD-04 | On a human player's turn, clicking a piece that has at least one legal move shall select it and highlight the valid destination squares. |
| FR-BOARD-05 | After selecting a piece, clicking a highlighted destination square shall execute that move. |
| FR-BOARD-06 | Clicking a square that is not a valid destination shall deselect the current piece (if any) and select the clicked piece if it has legal moves. |
| FR-BOARD-07 | When a pawn reaches the 8th rank, a promotion dialog shall appear offering Queen, Rook, Bishop, and Knight. The selected piece shall be used for the promotion. |
| FR-BOARD-08 | The board shall be non-interactive (clicks ignored) during AI thinking and during history browse mode. |
| FR-BOARD-09 | The most recently played move shall be visually indicated on the board. |

---

### FR-HIST — Move History Panel

| ID | Requirement |
| --- | --- |
| FR-HIST-01 | The History panel shall display all moves of the current game in standard algebraic notation (SAN). |
| FR-HIST-02 | Moves shall be grouped and numbered in pairs: `N. <white-move> <black-move>`. |
| FR-HIST-03 | When the game was started from a custom FEN in which it is Black's turn, the first move entry shall be prefixed with an ellipsis: `N. … <black-move>`. White's subsequent moves begin a new numbered pair. |
| FR-HIST-04 | When no moves have been made, the History panel shall display the text `"No moves yet."`. |
| FR-HIST-05 | Each move in the History panel shall be a clickable button that enters **browse mode** and shows the board position immediately after that move. |
| FR-HIST-06 | In browse mode, the currently selected move shall be highlighted in red (`.selected` style). |
| FR-HIST-07 | Highlighting shall be determined by matching `dataset.plyIndex` on each button against the store's `selectedPlyIndex`, not by DOM iteration order. |
| FR-HIST-08 | When a game is started from a custom FEN (via the FEN Apply button), the History panel shall display a `[Custom FEN]` banner as the first entry, rendered with a gold border and background, before any move entries. |
| FR-HIST-09 | The `[Custom FEN]` banner shall only appear when the game was explicitly started via the FEN Apply button; normal games shall not show this banner. |
| FR-HIST-10 | The History panel shall not apply any vertical cropping or `max-height` overflow clipping; all entries shall be fully visible. |

---

### FR-FEN — FEN Panel

| ID | Requirement |
| --- | --- |
| FR-FEN-01 | The FEN panel shall contain a text input field pre-populated with the FEN string of the current board position. |
| FR-FEN-02 | The FEN input shall update to reflect the current position after every move. |
| FR-FEN-03 | An **Apply** button and pressing **Enter** in the FEN input shall both trigger FEN application. |
| FR-FEN-04 | On Apply: the FEN string shall be validated; if invalid, a descriptive error message shall appear below the input and no game state change shall occur. |
| FR-FEN-05 | On a valid Apply: any ongoing game shall be stopped, history browse mode shall be exited if active, the move history shall be cleared, and the board shall immediately display the position described by the FEN. |
| FR-FEN-06 | After a valid Apply, the game shall resume from the new FEN position, respecting the active player indicated by the FEN's side-to-move field and the player type (Human or AI) set in Options. |
| FR-FEN-07 | After a valid Apply, the History panel shall show the `[Custom FEN]` banner as the first entry (see FR-HIST-08). |

---

### FR-ENG — Engine Info Panel

| ID | Requirement |
| --- | --- |
| FR-ENG-01 | The Engine Info panel shall display the following AI search metrics after each AI move: search depth, nodes evaluated, evaluation score, and principal variation (PV) in SAN. |
| FR-ENG-02 | Engine Info values shall be reset to `–` when the user enters history browse mode. |
| FR-ENG-03 | The Engine Info panel shall not apply any vertical cropping or overflow clipping. |

---

### FR-INFO — Info Panel

| ID | Requirement |
| --- | --- |
| FR-INFO-01 | The Info panel shall display the name of the current opening when the position is recognised from the opening book. |
| FR-INFO-02 | When no opening name is available, the opening field shall display `–`. |
| FR-INFO-03 | The Info panel shall not apply any vertical cropping or overflow clipping. |

---

### FR-OPT — Options & Configuration

| ID | Requirement |
| --- | --- |
| FR-OPT-01 | Options shall allow configuring White and Black independently as **Human** or **AI**. |
| FR-OPT-02 | Options shall allow setting the AI difficulty for White and Black independently: **Easy**, **Medium**, or **Hard**. |
| FR-OPT-03 | Options shall allow setting the AI device profile: **Auto (detect)**, **Desktop**, or **Mobile**. |
| FR-OPT-04 | When Device Profile is set to **Auto**, the application shall detect whether the device has a small viewport (≤ 900 px wide) or a coarse pointer (touch), resolving to **Mobile**; otherwise **Desktop**. |
| FR-OPT-05 | The Options view shall display a live hint showing the current resolved value of the **Auto** device profile setting, updating on selection change and window resize. |
| FR-OPT-06 | Options shall allow selecting the chess-set visual theme: **Glyph** (Unicode) or **Nice SVG**. |
| FR-OPT-07 | Changing the chess-set theme shall immediately recreate the board renderer with the new theme. |
| FR-OPT-08 | Options hint text shall state that changes take effect immediately on AI turns and on new games. Applying options while returning to gameplay shall immediately synchronize worker-side settings for the current position. |
| FR-OPT-09 | All option selections shall persist across page reloads via `localStorage`. |

---

### FR-GAME — Game Flow

| ID | Requirement |
| --- | --- |
| FR-GAME-01 | The application shall support starting a **New Game** from the side panel, resetting the board to the standard initial position and clearing all move history. |
| FR-GAME-02 | Starting a new game shall exit history browse mode if active. |
| FR-GAME-03 | On an AI player's turn, the AI shall execute its move automatically after a short delay (≈ 600 ms). |
| FR-GAME-04 | The header title shall display `"AI thinking…"` while the AI is computing a move. |
| FR-GAME-05 | The application shall support **browse mode**: clicking a move in the History panel navigates the board to that position without altering the game state. |
| FR-GAME-06 | In browse mode, a **Resume** button shall appear in the side panel. Resume shall only be enabled when the selected browse position is non-terminal and the active side has at least one legal move. If Resume is disabled, activating it shall have no effect and the application shall remain in browse mode. |
| FR-GAME-07 | Clicking an enabled Resume shall truncate the move history to the selected ply and continue the game from that position, respecting the current Options settings. |
| FR-GAME-08 | Entering browse mode shall cancel any pending AI move timer. |
| FR-GAME-09 | The game shall detect and announce terminal conditions: checkmate, stalemate, 50-move draw, threefold-repetition draw, and insufficient-material draw. |
| FR-GAME-10 | The header badge shall permanently display the current White player type / difficulty, Black player type / difficulty, resolved device profile, and UI mode (`game` or `browse`) in the format W [type] \| B [type] \| [profile] \| [mode]. |

---

### FR-PERS — Persistence

| ID | Requirement |
| --- | --- |
| FR-PERS-01 | The current board position (FEN), move history, and all Options settings shall be saved to `localStorage` automatically after every state change. |
| FR-PERS-02 | On page load, the last saved game state shall be restored: the board shall be set to the saved FEN, move history replayed to the store, and Options controls populated from saved settings. |
| FR-PERS-03 | If restored move history is non-empty, startup shall enter browse mode at the latest history ply (last move selected/highlighted) and shall not autoplay AI even when AI would otherwise be the next side to move. |
| FR-PERS-04 | If no persisted move history exists, startup shall begin a fresh game-state flow (no browse mode, no Resume visibility) using configured/default player settings. |
| FR-PERS-05 | Persistence failures (private browsing, storage quota exceeded, etc.) shall be silently ignored; the application shall continue to function without stored state. |

---

### FR-PWA — Progressive Web App

| ID | Requirement |
| --- | --- |
| FR-PWA-01 | The application shall register a Service Worker for offline capability when served over HTTPS or from localhost. |
| FR-PWA-02 | A `manifest.json` shall be provided to support installation as a home-screen web app on mobile devices. |
| FR-PWA-03 | Appropriate meta tags shall be present for Apple Mobile Web App integration (status bar style, icon, title). |

---

## 2. Non-Functional Requirements

### NFR-LAYOUT — Layout & Scrolling

| ID | Requirement |
| --- | --- |
| NFR-LAYOUT-01 | The application page shall allow natural vertical scrolling when content exceeds the viewport height; no global `overflow: hidden` shall be applied. |
| NFR-LAYOUT-02 | Individual side panels (History, Engine Info, Info, FEN) shall not impose internal overflow or height clipping; all content shall be fully visible without intra-panel scrolling. |
| NFR-LAYOUT-03 | The panel order in the Game view shall be: **History**, then **Engine Info**, then **Info**, then **FEN**. |

---

### NFR-ACC — Accessibility

| ID | Requirement |
| --- | --- |
| NFR-ACC-01 | Interactive elements (buttons, inputs) shall carry descriptive `aria-label` or visible text labels. |
| NFR-ACC-02 | The header badge and FEN status message shall use `aria-live="polite"` so assistive technologies announce changes. |
| NFR-ACC-03 | The promotion dialog shall include `role="dialog"`, `aria-modal="true"`, and an `aria-label`. |
| NFR-ACC-04 | The side navigation shall be wrapped in a `<nav>` element with an `aria-label`. |
| NFR-ACC-05 | A `<noscript>` message shall be displayed when JavaScript is disabled. |

---

### NFR-PERF — Performance

| ID | Requirement |
| --- | --- |
| NFR-PERF-01 | The chess engine (AI search, move generation) shall run in a dedicated Web Worker so the UI thread remains responsive during computation. |
| NFR-PERF-02 | Opening book lookups shall be resolved asynchronously at worker startup and shall not block subsequent message handling. |

---

### NFR-ARCH — Architecture

| ID | Requirement |
| --- | --- |
| NFR-ARCH-01 | UI state shall be managed through a single reactive store (Redux-pattern reducer) as the single source of truth. |
| NFR-ARCH-02 | The store shall be updated exclusively via dispatched action objects; direct mutation of state outside the reducer is forbidden. |
| NFR-ARCH-03 | The application shall use no third-party runtime libraries; all game logic, rendering, and state management shall be implemented in plain JavaScript. |
| NFR-ARCH-04 | All source files shall be ES modules. |
