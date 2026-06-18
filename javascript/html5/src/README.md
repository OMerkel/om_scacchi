# OM_Scacchi

[![Language: JavaScript](https://img.shields.io/badge/Language-JavaScript-F7DF1E?logo=javascript&logoColor=000)](https://developer.mozilla.org/docs/Web/JavaScript)
[![UI: HTML5](https://img.shields.io/badge/UI-HTML5-E34F26?logo=html5&logoColor=fff)](https://developer.mozilla.org/docs/Web/HTML)
[![Style: CSS3](https://img.shields.io/badge/Style-CSS3-1572B6?logo=css3&logoColor=fff)](https://developer.mozilla.org/docs/Web/CSS)
[![Concurrency: Web Worker](https://img.shields.io/badge/Concurrency-Web%20Worker-0A66C2)](https://developer.mozilla.org/docs/Web/API/Web_Workers_API)
[![Tests: Vitest](https://img.shields.io/badge/Tests-Vitest-6E9F18?logo=vitest&logoColor=fff)](https://vitest.dev)
[![E2E: Playwright](https://img.shields.io/badge/E2E-Playwright-2EAD33?logo=playwright&logoColor=fff)](https://playwright.dev)
[![AI: Negamax](https://img.shields.io/badge/AI-Negamax%20%2B%20Opening%20Book-1f6feb)](doc/computer_chess.md)
[![Coverage: 98%](https://img.shields.io/badge/Coverage-98%25-brightgreen)](#testing)

Browser chess game built with modern ES modules, a worker-owned engine loop, and no runtime UI framework.

## Highlights

- Full FIDE chess rules: castling, en passant, promotions, check/checkmate/stalemate, threefold repetition, 50-move rule, and insufficient material draws.
- Human vs Human, Human vs AI, and AI vs AI game modes.
- Independent AI difficulty for White and Black (Easy, Medium, Hard).
- Opening book support with weighted move selection and opening name reporting in telemetry.
- Negamax search with alpha-beta pruning, iterative deepening, aspiration windows, PVS, null-move pruning, LMR, check extensions, quiescence, and a persistent transposition table.
- Engine telemetry card (depth, nodes, score, principal variation, opening).
- FEN input card for loading positions.
- Browseable move history card (SAN with UCI fallback).
- Two chess themes: Glyph and Nice SVG.
- PWA support (manifest + service worker) for installable/offline usage.

## Tech Stack

- JavaScript (ES modules)
- HTML5 + CSS + SVG rendering
- Web Worker engine controller: `js/controller.js`
- Chess core: `js/chess/`
- Search core: `js/chess/ai/negamax_search.js`
- Unit tests: Vitest
- E2E tests: Playwright

## Project Structure

```text
src/
├── index.html
├── README.md
├── package.json
├── vitest.config.js
├── playwright.config.js
├── css/
│   └── index.css
├── doc/
│   ├── computer_chess.md
│   ├── engine_mcts_ucb.md
│   ├── implementation_plan.md
│   └── software_architecture.md
├── js/
│   ├── controller.js
│   ├── hmi.js
│   ├── store.js
│   ├── chess/
│   │   ├── ai/
│   │   │   ├── move_ordering.js
│   │   │   └── negamax_search.js
│   │   ├── board.js
│   │   ├── chess_renderer.js
│   │   ├── fen.js
│   │   ├── game.js
│   │   ├── move_generator.js
│   │   ├── opening_book.json
│   │   ├── position.js
│   │   ├── rules.js
│   │   ├── san.js
│   │   ├── storage.js
│   │   ├── transposition_table.js
│   │   └── types.js
│   ├── rendering/
│   │   ├── theme_chess_glyph.js
│   │   └── theme_chess_svg.js
│   └── uct/
│       ├── uct.js
│       └── uctnode.js
├── scripts/
│   ├── benchmark-engine-variants.js
│   └── run-tests-all.js
├── tests/
│   ├── server.js
│   ├── e2e/
│   │   └── game.spec.js
│   └── unit/
│       ├── uct.test.js
│       └── chess/
│           ├── board_and_move_generator.test.js
│           ├── fen.test.js
│           ├── game_status.test.js
│           ├── move_ordering.test.js
│           ├── negamax_and_tt.test.js
│           ├── position.test.js
│           ├── rules_and_legal_moves.test.js
│           ├── san.test.js
│           ├── storage.test.js
│           └── tactical_benchmark.test.js
└── img/
```

## Getting Started

### Prerequisites

- Node.js + npm
- Modern browser (Chrome, Firefox, Edge, Safari)

### Install dependencies

```sh
npm install
```

### Run locally

This app uses a module Web Worker, so it must be served over HTTP (not `file://`).

```sh
npm run dev
```

Then open <http://localhost:4173>.

## Gameplay and UI

1. Open the side panel from the menu button.
2. Start a new game or load a FEN from the FEN card.
3. Click a piece and then a legal destination square.
4. Promotion choices are shown when multiple promotion moves are legal.
5. AI turns are processed in the worker and applied automatically.

### Options

- White player: Human or AI
- Black player: Human or AI
- White AI difficulty: Easy, Medium, Hard
- Black AI difficulty: Easy, Medium, Hard
- AI device profile: Auto, Desktop, Mobile
- Chess set theme: Glyph, Nice SVG

The header badge reflects current setup, for example:

`W Hard | B human | Desktop`

## Engine Notes

- Search entrypoint: `searchBestMove()` in `js/chess/ai/negamax_search.js`.
- Difficulty maps to different depth, node budget, and soft/hard time windows.
- Opening book is read from `js/chess/opening_book.json`; legal weighted candidates are sampled.
- Telemetry includes best move PV, searched depth, node count, and score.
- A persistent transposition table is kept in worker state and reset on new game.

## Testing

### Unit tests

```sh
npm test
```

### Unit tests in watch mode

```sh
npm run test:watch
```

### Unit coverage report

```sh
npm run test:coverage
```

Coverage output is generated under `coverage/`.

### E2E tests

```sh
npm run test:e2e
```

### Full test run (unit + E2E)

```sh
npm run test:all
```

### Engine benchmark script

```sh
npm run benchmark:engine
```

### Self-play Elo gauntlet

```sh
npm run benchmark:selfplay
```

Example with explicit budget and variant under test:

```sh
node scripts/selfplay-gauntlet.js --games 40 --depth 6 --nodes 1200000 --candidate '{"useNullMovePruning":false}' --record
```

### Self-play trend dashboard

```sh
npm run benchmark:selfplay:trend
```

Read only the most recent runs:

```sh
node scripts/selfplay-trend.js --last 10
```

## Documentation

- `doc/computer_chess.md` - engine representation and search notes.
- `doc/software_architecture.md` - current architecture and runtime interaction model.
- `doc/engine_protocol.md` - worker/UI message protocol, payloads, and difficulty budget mapping.
- `doc/contributor_checks.md` - pre-PR validation commands and contributor checklist.
- `doc/engine_mcts_ucb.md` - legacy UCT/MCTS details.

## Troubleshooting

### `node` opens Microsoft HPC help on Windows

On some Windows setups, `node` can resolve to a Microsoft HPC tool instead of Node.js.
If that happens, call npm directly:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run test
```

## License

- Source code: MIT License
- Image assets: see in-app About section and repository license files

## Credits

Original game implementation and AI foundations by Oliver Merkel.
