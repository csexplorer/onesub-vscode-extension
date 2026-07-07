# Codex Provider Support — Design

Date: 2026-07-07
Status: approved

## Goal

Add OpenAI Codex CLI as a second engine behind the existing `AIProvider`
interface, selectable via a setting. No UI or feature changes — the buttons
(commit message, explain, docstring) work identically on either engine.

## Settings

| Setting | Type | Default | Purpose |
| --- | --- | --- | --- |
| `onesub.engine` | enum `"claude-code" \| "codex"` | `"claude-code"` | Which engine runs the buttons. |
| `onesub.codexPath` | string | `"codex"` | Path to the Codex CLI if not on `PATH`. Mirrors `onesub.claudePath`. |

The existing config-change listener in `extension.ts` already rebuilds the
provider on relevant setting changes; add `onesub.engine` and
`onesub.codexPath` to its watch list.

## New module: `src/providers/CodexProvider.ts`

Mirrors `ClaudeCodeProvider` in shape and error discipline.

- `name = "Codex"`.
- `run(req)`:
  - Spawn `codex exec` in headless mode with the prompt delivered on stdin
    (`codex exec -` reads stdin) — avoids arg-length limits and shell
    escaping, same rationale as the Claude adapter.
  - `codex exec` mixes progress/log lines into stdout, so capture the final
    agent message cleanly via `--output-last-message <tmpfile>` (or `--json`
    parsing if that flag proves unavailable). Verify the exact flag against
    the installed CLI at implementation time.
  - Pass `--skip-git-repo-check`: Codex refuses to run outside a git repo by
    default, but Explain Selection may run on files outside one.
  - Map failures exactly like the Claude adapter:
    - `ExecutableNotFoundError` → `AIProviderError` with install remedy.
    - `TimeoutError` → `AIProviderError` naming `onesub.requestTimeoutMs`.
    - Non-zero exit with auth-looking stderr → "not signed in" error.
    - Empty output → explicit error.
- `checkHealth(signal)`:
  - Tier 1: `codex --version` → `not-installed` / `error`.
  - Tier 2: `codex login status` → `healthy` / `not-logged-in`. Unlike the
    Claude probe, this spends zero tokens (Codex has a real auth-status
    command).
- Remedies: install `npm install -g @openai/codex`; login `codex login`.
- Auth-failure stderr patterns: reuse the generic set (login/sign in/401/403)
  plus Codex-specific fragments ("codex login", "not logged in").

## `extension.ts`

`buildProvider()` returns `AIProvider` (interface, not the concrete class)
and switches on `onesub.engine`:

```ts
function buildProvider(): AIProvider {
  const cfg = getConfig();
  return cfg.engine === "codex"
    ? new CodexProvider({ codexPath: cfg.codexPath, timeoutMs: cfg.requestTimeoutMs })
    : new ClaudeCodeProvider({ claudePath: cfg.claudePath, timeoutMs: cfg.requestTimeoutMs });
}
```

Features, `HealthManager`, and the status bar already depend only on the
interface — no other wiring changes.

## `core/config.ts`

Add `engine` and `codexPath` to the config reader with the defaults above.

## Testing

- `core/` stays pure and vscode-free. If Codex output needs cleanup beyond
  what `core/parse.ts` already does, that logic lands in `core/` with
  `node:test` coverage.
- The provider itself is thin process glue; verified manually via F5 with
  `onesub.engine: "codex"` and via the health probe.

## Out of scope (YAGNI)

- Auto-detect / fallback between engines.
- Per-command engine override.
- Codex-specific prompt templates.
