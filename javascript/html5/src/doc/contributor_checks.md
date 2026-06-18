# Contributor Checks

This file defines the expected local checks before opening a PR.

Working directory for commands:

- `javascript/html5/src`

## 1. Prerequisites

- Node.js and npm installed.
- Browser support for Playwright (first run may install browsers automatically).

Windows note:

- On some setups, `node` can resolve to Microsoft HPC tools.
- If that happens, prepend Node path before running commands:

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
```

## 2. Install Dependencies

```sh
npm install
```

## 3. Required Validation Commands

Run all of the following:

1. Unit tests

```sh
npm test
```

2. Unit coverage (must satisfy configured thresholds)

```sh
npm run test:coverage
```

3. E2E tests

```sh
npm run test:e2e
```

Equivalent combined run:

```sh
npm run test:all
```

## 4. Coverage Gates

Coverage thresholds are configured in `vitest.config.js`:

- statements: 98
- branches: 98
- functions: 98
- lines: 98

If thresholds fail, PR should not be merged until addressed or explicitly approved by maintainers.

## 5. Manual Smoke Checks (Recommended)

Start dev server:

```sh
npm run dev
```

Open `http://localhost:4173` and verify:

- app loads and board renders
- move interaction works for human turn
- options changes update badge and apply behavior
- FEN apply handles valid and invalid input
- new game and undo commands behave as expected

## 6. Engine Change Checklist

If your changes touch search, move generation, or rules:

1. Run benchmark script and keep output in PR notes.

```sh
npm run benchmark:engine
```

2. Confirm no regression in tactical benchmark tests.
3. Confirm no worker protocol shape breakage for `engineInfo` and move events.
4. Update these docs when relevant:
   - `doc/computer_chess.md`
   - `doc/software_architecture.md`
   - `doc/engine_protocol.md`

## 7. Documentation Change Checklist

For doc-only PRs:

- verify references point to existing files/modules
- avoid describing planned features as implemented
- include legacy/runtime clarification where needed (UCT vs negamax)

## 8. Suggested PR Template Snippets

Validation section:

```text
Validation run:
- npm test: PASS/FAIL
- npm run test:coverage: PASS/FAIL
- npm run test:e2e: PASS/FAIL
```

If engine-related:

```text
Benchmark delta:
- command: npm run benchmark:engine
- summary: (node count / depth / move stability changes)
```
