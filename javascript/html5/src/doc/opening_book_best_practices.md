# Opening Book Best Practices

This guide describes a safe, repeatable process to create or refine `js/chess/opening_book.json`.

It is tailored to OM Scacchi architecture:

- Opening book entries are consumed by the worker controller.
- Entries are keyed by exact FEN.
- Candidate moves are weighted probabilities.
- Strict legality and consistency checks are required after every change.

## 1. Book Entry Contract

Each entry must follow this shape:

```json
{
  "fen": "<valid FEN>",
  "name": "<opening or branch name>",
  "moves": [
    {
      "uci": "e2e4",
      "weight": 60,
      "name": "King's Pawn"
    }
  ]
}
```

Rules:

- `fen` must parse successfully via chess position/FEN parser.
- Every `uci` move must be legal from that exact `fen`.
- `weight` values should be non-negative integers.
- Sum of all weights in one entry must be exactly `100`.
- FEN keys must be unique across the whole file.
- Keep branch names descriptive and consistent with nearby nodes.

## 2. Design Principles

### 2.1 Keep Branches Practical

Prefer early-ply moves that are common in human play and engine practice.

- Favor mainstream continuations in high-level nodes.
- Keep side-lines present, but at lower probability.
- Avoid adding rare traps unless they are explicitly desired for style.

### 2.2 Keep Coverage Local and Coherent

When adding a node, also add 1-2 natural child nodes where useful.

- Avoid orphan nodes with no meaningful continuation.
- Keep move-order transpositions clearly named.
- Use one naming style inside a family (for example, all `Reti-Indian: ...`).

### 2.3 Prefer Conservative Reweighting

When refining existing entries:

- Change weights first before adding new moves.
- Keep deltas modest unless data strongly justifies a large shift.
- Rebalance toward common moves, not novelty.

## 3. Safe Editing Workflow

1. Inspect current neighboring entries before editing.
2. Edit the smallest set of nodes needed.
3. Validate legality for all entries, not only touched entries.
4. Validate weight sums and duplicate FEN keys.
5. Run full tests.

Why full-file validation matters:

- JSON books are easy to break with local edits.
- A legal move in one FEN may be illegal in a nearby transposed FEN.
- Duplicates silently override intent and reduce determinism.

## 4. Validation Commands (PowerShell)

Run from `javascript/html5/src`.

Important on this Windows setup: prepend `C:\Program Files\nodejs` to `PATH` before Node/npm commands.

### 4.1 Weight-Sum Audit

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('js/chess/opening_book.json','utf8')); let bad=0; for(const e of data.entries){ const s=e.moves.reduce((a,m)=>a+(Number(m.weight)||0),0); if(s!==100){ bad++; console.log('WEIGHT_SUM',s,'|',e.name,'|',e.fen);} } console.log('non100_weight_entries',bad);"
```

Expected: `non100_weight_entries 0`.

### 4.2 Legality Audit

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
node --input-type=module -e "import fs from 'node:fs'; import {createPositionFromFen} from './js/chess/position.js'; import {generateLegalMoves, moveToUci} from './js/chess/move_generator.js'; const data=JSON.parse(fs.readFileSync('js/chess/opening_book.json','utf8')); let bad=0; for(const e of data.entries){ let pos; try{ pos=createPositionFromFen(e.fen);} catch(err){ bad++; console.log('BAD_FEN',e.name,'|',e.fen); continue;} const legal=new Set(generateLegalMoves(pos).map(moveToUci)); const illegal=e.moves.filter(m=>!legal.has(m.uci)); if(illegal.length){ bad += illegal.length; console.log('ILLEGAL',e.name,'|',illegal.map(m=>m.uci).join(',')); } } console.log('legality_issues',bad);"
```

Expected: `legality_issues 0`.

### 4.3 Duplicate-FEN Audit

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('js/chess/opening_book.json','utf8')); const seen=new Set(); let dup=0; for(const e of data.entries){ if(seen.has(e.fen)) dup++; else seen.add(e.fen);} console.log('entries',data.entries.length); console.log('duplicate_fens',dup);"
```

Expected: `duplicate_fens 0`.

### 4.4 Regression Suite

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm test
```

Expected: all tests pass.

## 5. Recommended Weighting Heuristics

Use this as a starting template for early-game nodes with 3-4 moves:

- Mainstream move: 45-65
- Secondary practical move: 20-35
- Tertiary move: 10-20
- Rare but valid move: 5-12

Adjustment signals:

- Increase if move appears often in practical databases or stable engine preference.
- Decrease if move is mostly transpositional noise or produces weaker structures.
- Keep at least two playable choices in high-level nodes to avoid deterministic openings.

## 6. Naming Conventions

Use stable prefixes so branches are easy to grep and maintain:

- `Reti-Indian: ...`
- `English Opening: ...`
- `Queen's Gambit ...`
- `QGD ...`, `QGA ...`, `Slav ...`

Guidelines:

- Keep names concise.
- Prefer one separator style (`:` for branch, descriptive suffix after).
- Use consistent capitalization (`setup`, `structure`, `main line`) per family.

## 7. Common Failure Modes

1. En-passant field in FEN is wrong after pawn double-step branches.
2. Move UCI typo (`e2e5` vs `e2e4`) slips into JSON.
3. Weight sums drift from 100 after manual edits.
4. Duplicate FEN introduced by adding a transposition node.
5. Broad manual edits corrupt JSON punctuation.

Mitigations:

- Prefer small, targeted edits.
- Run all three audits every time.
- Use temporary scripts for bulk transforms rather than manual mega-patches.

## 8. Refinement Checklist (Definition of Done)

A refinement is complete only when all are true:

1. New/edited nodes are coherent with neighboring lines.
2. Every entry weight sum is `100`.
3. Global legality audit reports `0` issues.
4. Duplicate-FEN audit reports `0` duplicates.
5. `npm test` passes fully.
6. Names are consistent with existing branch family style.

## 9. Suggested Future Improvements

- Add a dedicated `scripts/audit-opening-book.mjs` command to centralize all three audits.
- Add CI hook to block merges on legality/duplicate/weight failures.
- Optionally store source annotations (for example, human frequency tier) outside runtime JSON.
