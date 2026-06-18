# Engine Protocol (Worker <-> UI)

This document specifies the currently implemented message protocol between:

- main-thread UI (`js/hmi.js`)
- worker engine (`js/controller.js`)

Scope:

- chess runtime protocol only
- request and event payloads actually used by current code

## 1. Transport Envelope

All messages use a plain object envelope with at least:

```js
{
  class: "request",
  request: string,
  ...payload
}
```

Notes:

- `class` is currently always set to `"request"` by both sender sides.
- `request` identifies the action/event type.

## 2. UI -> Worker Requests

### 2.1 `chess_start`

Purpose:

- start a new game
- optionally load a supplied FEN
- reset worker transposition table and undo history

Payload:

```js
{
  class: "request",
  request: "chess_start",
  settings: Settings,
  fen?: string
}
```

Worker behavior summary:

- applies settings
- attempts `createPositionFromFen(fen)` if provided
- on parse failure, falls back to initial position
- posts `chess_redraw`
- posts either `chess_human_to_move` or `chess_ai_to_move` when non-terminal

### 2.2 `chess_move`

Purpose:

- submit one human move candidate

Payload:

```js
{
  class: "request",
  request: "chess_move",
  settings: Settings,
  action: Move
}
```

Worker behavior summary:

- validates against legal moves
- if invalid, emits `chess_redraw` with `info: "illegal_move"`
- if valid, applies move and emits redraw/next-turn event

### 2.3 `chess_action_by_ai`

Purpose:

- trigger AI turn computation

Payload:

```js
{
  class: "request",
  request: "chess_action_by_ai",
  settings: Settings
}
```

Worker behavior summary:

- tries opening book first
- otherwise runs negamax search with difficulty-derived budgets
- emits `chess_redraw` with `engineInfo`
- emits next-turn event if non-terminal

### 2.4 `chess_undo`

Purpose:

- undo moves back to same human side-to-move (when possible)

Payload:

```js
{
  class: "request",
  request: "chess_undo",
  settings: Settings
}
```

Worker behavior summary:

- no-op if history has only initial position
- no-op if current side-to-move is AI
- otherwise rewinds history and emits redraw/human-turn

## 3. Worker -> UI Events

### 3.1 `chess_redraw`

Purpose:

- push latest position and optional telemetry after move/application updates

Payload:

```js
{
  class: "request",
  request: "chess_redraw",
  chessPosition: Position,
  fen: string,
  status: GameStatus,
  latestMoveUci?: string,
  engineInfo?: EngineInfo,
  info?: "illegal_move"
}
```

UI handling:

- updates store position/fen/status/last move
- updates telemetry card when `engineInfo` exists
- appends move history when `latestMoveUci` changes

### 3.2 `chess_human_to_move`

Purpose:

- indicate that a human side must act

Payload:

```js
{
  class: "request",
  request: "chess_human_to_move",
  chessPosition: Position,
  fen: string,
  status: GameStatus,
  legalMoves: Move[]
}
```

UI handling:

- enters `human_turn` phase
- enables board interaction via legal move highlights

### 3.3 `chess_ai_to_move`

Purpose:

- indicate that AI should act next

Payload:

```js
{
  class: "request",
  request: "chess_ai_to_move",
  chessPosition: Position,
  fen: string,
  status: GameStatus
}
```

UI handling:

- enters `ai_thinking` phase
- schedules a delayed `chess_action_by_ai` request (currently 600ms)

## 4. Shared Shapes

### 4.1 Settings

Source: `readSettings()` in `js/hmi.js`.

```js
{
  playersouth: "Human" | "AI",
  playernorth: "Human" | "AI",
  difficultysouth: "Easy" | "Medium" | "Hard",
  difficultynorth: "Easy" | "Medium" | "Hard",
  deviceprofile: "Auto" | "Desktop" | "Mobile",
  chesssettheme: "Glyph" | "NiceSvg",
  resolveddeviceprofile: "Desktop" | "Mobile"
}
```

### 4.2 Move

The worker validates move equality by these fields:

```js
{
  from: { row: number, col: number },
  to: { row: number, col: number },
  flags?: {
    capture?: boolean,
    promotion?: "q" | "r" | "b" | "n",
    enPassant?: boolean,
    castling?: "K" | "Q" | "k" | "q"
  }
}
```

### 4.3 EngineInfo

```js
{
  pv: string[],
  nodes: number,
  score: number,
  depth: number,
  bestMove: string | null,
  fromBook: boolean,
  openingName: string | null
}
```

## 5. Difficulty -> Search Budget Mapping

Current worker mapping by difficulty:

- Easy:
  - depth: 2
  - maxNodes: 80_000
  - maxTimeMs: 220
- Medium:
  - depth: 4
  - maxNodes: 500_000
  - maxTimeMs: 900
- Hard:
  - depth: 7
  - maxNodes: 1_800_000
  - maxTimeMs: 2_800

Soft/hard time windows are derived from `maxTimeMs` and per-difficulty overhead.

## 6. Error and Fallback Behavior

- Invalid FEN in `chess_start`: worker falls back to initial position.
- Invalid `chess_move` action: emits redraw with `info: "illegal_move"`; position unchanged.
- Opening book miss: falls back to negamax search.
- Search returns no move in non-terminal path: redraw still emitted; caller should treat as engine anomaly.

## 7. Versioning Guidance

When protocol fields change:

1. Update this file in same pull request.
2. Update `doc/software_architecture.md` section on worker protocol.
3. Add or adjust unit/integration tests for message shape assumptions.
