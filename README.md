# OneSub

**One-click routine dev actions that run through your locally installed Claude Code | Codex CLI.**

OneSub is a VS Code extension that adds buttons for the boring parts of coding —
generating a commit message, explaining a snippet, writing a docstring — and
runs them through your own **Claude Code** | **Codex** CLI. If you already have Claude Code & Codex
installed and signed in, the buttons just work.

## Why

VS Code is free, and if you already have Claude Code | Codex installed, it already talks
to a model. OneSub wires that CLI into the editor as a few sharp buttons — it
never touches your tokens or credentials; the official CLI owns the auth.

## Features (v1)

| Button | Where | What it does |
| --- | --- | --- |
| **Generate Commit Message** | Source Control title bar | Reads the staged diff (stages everything first if nothing is staged) → **fills** the commit box (never auto-commits). Refuses oversized diffs instead of truncating. |
| **Explain Selection** | Editor right-click / Command Palette | Explains the selected code in a transient markdown view. |
| **Generate Docstring** | Editor right-click / Command Palette | Inserts an idiomatic doc comment above the selection (or current line). |

There is **no chat panel** — OneSub is deliberately a set of one-click actions, not
another agent chat.

## Requirements

- One of the supported engines installed and signed in:
  - [Claude Code](https://docs.claude.com/claude-code) (default):
    ```
    npm install -g @anthropic-ai/claude-code
    claude            # then sign in
    ```
  - [Codex CLI](https://github.com/openai/codex) (set `onesub.engine` to `codex`):
    ```
    npm install -g @openai/codex
    codex login
    ```
- VS Code `^1.90.0`.

On activation OneSub health-checks the engine (installed? signed in?) and shows the
result in the status bar. If it isn't ready, the buttons guide you to fix it
rather than failing silently.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `onesub.engine` | `claude-code` | Which engine runs the buttons: `claude-code` or `codex`. |
| `onesub.claudePath` | `claude` | Path to the Claude Code CLI if it isn't on `PATH`. |
| `onesub.codexPath` | `codex` | Path to the Codex CLI if it isn't on `PATH`. |
| `onesub.diffMaxLines` | `0` | Refuse commit generation above this many changed lines. `0` disables the check. |
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
 │   ├─ AIProvider.ts        engine interface
 │   ├─ ClaudeCodeProvider   wraps `claude -p` headless; health probe
 │   └─ CodexProvider        wraps `codex exec` headless; `codex login status` probe
 ├─ core/                    pure, vscode-free, unit-tested
 │   ├─ exec.ts              spawn wrapper (timeout / abort / stdin)
 │   ├─ diffGuard.ts         measure + gate staged diffs
 │   ├─ prompts.ts           per-button prompt templates
 │   └─ parse.ts             clean model output (fences, preambles, quotes)
 ├─ features/                commit / explain / docstring handlers
 ├─ ui/                      output channel, health manager, progress
 └─ git.ts                   repo lookup + staged diff + commit box
```

The engines live behind `AIProvider`; adding another CLI engine is one more
adapter with no UI changes. Pure logic lives in `core/` with zero VS Code imports and is
covered by `node:test`; the VS Code layer stays thin glue.

See [`docs/PLAN.md`](docs/PLAN.md) for the full v1 spec and the design decisions
behind it.

## License

MIT
