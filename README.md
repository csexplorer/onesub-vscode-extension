# OneSub

**One-click routine dev actions, powered by the Claude subscription you already pay for.**

OneSub is a VS Code extension that adds buttons for the boring parts of coding —
generating a commit message, explaining a snippet, writing a docstring — and
runs them through your own **Claude Code** CLI. No Copilot, no API key, no second
subscription. If you already log into Claude Code, the buttons just work.

## Why

Common belief: "I pay for Claude, but I still pay for my editor's AI." You don't
have to. VS Code is free, and your Claude Code subscription already talks to a
model. OneSub wires that CLI into the editor as a few sharp buttons — it never
touches your tokens or credentials; the official CLI owns the auth.

## Features (v1)

| Button | Where | What it does |
| --- | --- | --- |
| **Generate Commit Message** | Source Control title bar | Reads the staged diff → **fills** the commit box (never auto-commits). Refuses oversized diffs instead of truncating. |
| **Explain Selection** | Editor right-click / Command Palette | Explains the selected code in a transient markdown view. |
| **Generate Docstring** | Editor right-click / Command Palette | Inserts an idiomatic doc comment above the selection (or current line). |

There is **no chat panel** — OneSub is deliberately a set of one-click actions, not
another agent chat.

## Requirements

- [Claude Code](https://docs.claude.com/claude-code) installed and signed in:
  ```
  npm install -g @anthropic-ai/claude-code
  claude            # then sign in
  ```
- VS Code `^1.90.0`.

On activation OneSub health-checks the engine (installed? signed in?) and shows the
result in the status bar. If it isn't ready, the buttons guide you to fix it
rather than failing silently.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `onesub.claudePath` | `claude` | Path to the CLI if it isn't on `PATH`. |
| `onesub.diffMaxLines` | `400` | Refuse commit generation above this many changed lines. |
| `onesub.commitConvention` | `conventional` | `conventional` (feat:/fix:) or `plain`. |
| `onesub.requestTimeoutMs` | `60000` | Abort a call after this long. |

## Develop

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run test          # compiles, runs node:test unit tests (pure core)
npm run bundle        # esbuild → dist/extension.js
npm run watch         # rebundle on change
```

Press <kbd>F5</kbd> in VS Code to launch the Extension Development Host.

## Architecture

```
extension.ts            activation, command registration, config-change rewiring
 ├─ providers/
 │   ├─ AIProvider.ts        engine interface (Codex can slot in later)
 │   └─ ClaudeCodeProvider   M1: wraps `claude -p` headless; health probe
 ├─ core/                    pure, vscode-free, unit-tested
 │   ├─ exec.ts              spawn wrapper (timeout / abort / stdin)
 │   ├─ diffGuard.ts         measure + gate staged diffs
 │   ├─ prompts.ts           per-button prompt templates
 │   └─ parse.ts             clean model output (fences, preambles, quotes)
 ├─ features/                commit / explain / docstring handlers
 ├─ ui/                      output channel, health manager, progress
 └─ git.ts                   repo lookup + staged diff + commit box
```

The engine is behind `AIProvider`, so adding **Codex** later is a second adapter
with no UI changes. Pure logic lives in `core/` with zero VS Code imports and is
covered by `node:test`; the VS Code layer stays thin glue.

See [`docs/PLAN.md`](docs/PLAN.md) for the full v1 spec and the design decisions
behind it.

## License

MIT
