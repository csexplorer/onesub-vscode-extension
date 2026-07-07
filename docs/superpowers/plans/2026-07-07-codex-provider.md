# Codex Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenAI Codex CLI as a second engine behind the existing `AIProvider` interface, selectable via a new `onesub.engine` setting.

**Architecture:** A new `CodexProvider` mirrors `ClaudeCodeProvider` (spawn CLI headless, prompt on stdin, map failures to `AIProviderError`). Engine choice is a plain switch in `buildProvider()`; everything downstream already depends only on the `AIProvider` interface. Shared auth-failure detection is extracted to one module so both providers use it.

**Tech Stack:** TypeScript, VS Code extension API, `node:test`, esbuild. Codex CLI ≥ 0.139.0 (`codex exec` flags verified against that version).

## Global Constraints

- `core/` and `providers/authPatterns.ts` must stay vscode-free (no `vscode` imports).
- Tests run via `npm run test` which compiles `src/` to `out/` then runs `node --test out/**/*.test.js`.
- Typecheck via `npm run typecheck` (`tsc --noEmit`) must stay clean.
- Setting IDs are `onesub.engine` (enum `"claude-code" | "codex"`, default `"claude-code"`) and `onesub.codexPath` (string, default `"codex"`).
- Codex invocation flags (verified on codex-cli 0.139.0): `exec`, `--skip-git-repo-check`, `-s read-only`, `--ephemeral`, `--color never`, `-o <file>` (`--output-last-message`), positional `-` = read prompt from stdin.
- Health tier 2 is `codex login status` — exit 0 means logged in; it spends zero tokens.

---

### Task 1: Extract shared auth-failure detection

**Files:**
- Create: `src/providers/authPatterns.ts`
- Modify: `src/providers/ClaudeCodeProvider.ts` (remove local copy, import shared)
- Test: `src/providers/authPatterns.test.ts`

**Interfaces:**
- Produces: `looksLikeAuthFailure(text: string): boolean` from `./authPatterns.js`, used by both providers.

- [ ] **Step 1: Write the failing test**

Create `src/providers/authPatterns.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeAuthFailure } from "./authPatterns.js";

test("detects classic auth failure fragments", () => {
  assert.equal(looksLikeAuthFailure("Please log in to continue"), true);
  assert.equal(looksLikeAuthFailure("error: not authenticated"), true);
  assert.equal(looksLikeAuthFailure("HTTP 401 Unauthorized"), true);
  assert.equal(looksLikeAuthFailure("invalid api key"), true);
});

test("detects codex-specific fragments", () => {
  assert.equal(looksLikeAuthFailure("Run `codex login` first"), true);
  assert.equal(looksLikeAuthFailure("Not logged in"), true);
});

test("ignores unrelated errors", () => {
  assert.equal(looksLikeAuthFailure("network unreachable"), false);
  assert.equal(looksLikeAuthFailure(""), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module './authPatterns.js'` (compile error surfaces via the pretest compile step).

- [ ] **Step 3: Write minimal implementation**

Create `src/providers/authPatterns.ts`:

```ts
// stderr fragments that mean "installed but not authenticated". Shared by all
// CLI providers; vscode-free.
const AUTH_PATTERNS = [
  /log ?in/i,          // "log in", "login", "logged in", "codex login"
  /sign ?in/i,
  /authenticat/i,
  /unauthori[sz]ed/i,
  /credential/i,
  /api key/i,
  /\b401\b/,
  /\b403\b/
];

export function looksLikeAuthFailure(text: string): boolean {
  return AUTH_PATTERNS.some((re) => re.test(text));
}
```

Note: `/log ?in/i` already matches "Not logged in" and "codex login"; no extra
patterns needed. `/not authenticated/i` from the old list is subsumed by
`/authenticat/i` — drop the duplicate.

Then in `src/providers/ClaudeCodeProvider.ts` delete the local
`AUTH_PATTERNS` array and `looksLikeAuthFailure` function (lines defining
them) and add the import:

```ts
import { looksLikeAuthFailure } from "./authPatterns.js";
```

- [ ] **Step 4: Run tests + typecheck to verify pass**

Run: `npm run test && npm run typecheck`
Expected: all tests PASS (existing core tests + 3 new), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/providers/authPatterns.ts src/providers/authPatterns.test.ts src/providers/ClaudeCodeProvider.ts
git commit -m "Extract shared auth-failure detection for providers"
```

---

### Task 2: Engine + codexPath settings

**Files:**
- Modify: `package.json` (configuration properties)
- Modify: `src/config.ts`

**Interfaces:**
- Produces: `OneSubConfig` gains `engine: "claude-code" | "codex"` and `codexPath: string`; `readConfig()` returns them. Task 4 consumes both.

- [ ] **Step 1: Add settings to package.json**

In `package.json` under `contributes.configuration.properties`, add before
`"onesub.claudePath"`:

```json
"onesub.engine": {
  "type": "string",
  "enum": ["claude-code", "codex"],
  "default": "claude-code",
  "description": "Which locally installed CLI engine runs the buttons."
},
```

and after `"onesub.claudePath"`:

```json
"onesub.codexPath": {
  "type": "string",
  "default": "codex",
  "description": "Path to the Codex CLI executable. Leave as 'codex' if it is on your PATH."
},
```

- [ ] **Step 2: Extend src/config.ts**

Replace the interface and reader:

```ts
export type EngineId = "claude-code" | "codex";

export interface OneSubConfig {
  engine: EngineId;
  claudePath: string;
  codexPath: string;
  diffMaxLines: number;
  commitConvention: CommitConvention;
  requestTimeoutMs: number;
}

export function readConfig(): OneSubConfig {
  const c = vscode.workspace.getConfiguration(BRAND.id);
  const convention = c.get<string>("commitConvention", "conventional");
  const engine = c.get<string>("engine", "claude-code");
  return {
    engine: engine === "codex" ? "codex" : "claude-code",
    claudePath: c.get<string>("claudePath", "claude"),
    codexPath: c.get<string>("codexPath", "codex"),
    diffMaxLines: c.get<number>("diffMaxLines", 0),
    commitConvention: convention === "plain" ? "plain" : "conventional",
    requestTimeoutMs: c.get<number>("requestTimeoutMs", 60_000)
  };
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run test`
Expected: clean / all PASS. (No unit test for `readConfig` — it is a thin
`vscode` API wrapper and `core/` stays vscode-free; the existing config-change
listener already watches the whole `onesub.*` namespace via
`e.affectsConfiguration(BRAND.id)`, so no listener change is needed.)

- [ ] **Step 4: Commit**

```bash
git add package.json src/config.ts
git commit -m "Add onesub.engine and onesub.codexPath settings"
```

---

### Task 3: CodexProvider

**Files:**
- Create: `src/providers/CodexProvider.ts`

**Interfaces:**
- Consumes: `AIProvider`, `AIRequest`, `AIProviderError`, `HealthStatus` from `./AIProvider.js`; `run`, `ExecutableNotFoundError`, `TimeoutError` from `../core/exec.js`; `looksLikeAuthFailure` from `./authPatterns.js` (Task 1).
- Produces: `class CodexProvider implements AIProvider`, constructor `new CodexProvider({ codexPath?: string; timeoutMs?: number })`. Task 4 consumes it.

- [ ] **Step 1: Write the implementation**

Create `src/providers/CodexProvider.ts`:

```ts
// Second engine: wrap the user's own `codex` (OpenAI Codex) CLI in headless
// exec mode. Same discipline as the Claude adapter: prompt on stdin, no token
// or credential handling — `codex login` owns the auth. The final agent
// message is captured via --output-last-message because `codex exec` mixes
// progress logging into stdout.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AIProvider,
  AIProviderError,
  AIRequest,
  HealthStatus
} from "./AIProvider.js";
import {
  run,
  ExecutableNotFoundError,
  TimeoutError
} from "../core/exec.js";
import { looksLikeAuthFailure } from "./authPatterns.js";

const INSTALL_REMEDY = "npm install -g @openai/codex";
const LOGIN_REMEDY = "codex login";

export interface CodexOptions {
  /** Path/name of the CLI. Defaults to "codex" (resolved via PATH). */
  codexPath?: string;
  /** Default per-request timeout. */
  timeoutMs?: number;
}

export class CodexProvider implements AIProvider {
  readonly name = "Codex";
  private readonly codexPath: string;
  private readonly defaultTimeout: number;

  constructor(opts: CodexOptions = {}) {
    this.codexPath = opts.codexPath?.trim() || "codex";
    this.defaultTimeout = opts.timeoutMs ?? 60_000;
  }

  async run(req: AIRequest): Promise<string> {
    // codex exec logs progress to stdout, so the clean final message goes to
    // a temp file via --output-last-message.
    const dir = await mkdtemp(join(tmpdir(), "onesub-codex-"));
    const lastMessageFile = join(dir, "last-message.txt");
    try {
      let result;
      try {
        result = await run(this.codexPath, {
          args: [
            "exec",
            "--skip-git-repo-check", // explain/docstring may run outside a repo
            "-s", "read-only",       // we only ever want text back
            "--ephemeral",           // one-shot: don't persist session files
            "--color", "never",
            "-o", lastMessageFile,
            "-"                      // read the prompt from stdin
          ],
          input: req.prompt,
          cwd: req.cwd,
          timeoutMs: req.timeoutMs ?? this.defaultTimeout,
          signal: req.signal
        });
      } catch (err) {
        if (err instanceof ExecutableNotFoundError) {
          throw new AIProviderError(
            `Codex CLI ("${this.codexPath}") was not found.`,
            `Install it with: ${INSTALL_REMEDY}`
          );
        }
        if (err instanceof TimeoutError) {
          throw new AIProviderError(
            `Codex timed out after ${err.timeoutMs}ms.`,
            "The request was aborted. Try again or raise onesub.requestTimeoutMs."
          );
        }
        throw err; // AbortError / unexpected — let the caller handle.
      }

      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout).trim();
        if (looksLikeAuthFailure(detail)) {
          throw new AIProviderError(
            "Codex is not signed in.",
            detail || `Run \`${LOGIN_REMEDY}\` in a terminal and sign in.`
          );
        }
        throw new AIProviderError(
          `Codex exited with code ${result.code}.`,
          detail || "No error output."
        );
      }

      let text = "";
      try {
        text = (await readFile(lastMessageFile, "utf8")).trim();
      } catch {
        // File missing — fall through to the empty-response error below.
      }
      if (!text) {
        throw new AIProviderError(
          "Codex returned an empty response.",
          result.stderr.trim() || undefined
        );
      }
      return text;
    } finally {
      void rm(dir, { recursive: true, force: true });
    }
  }

  async checkHealth(signal?: AbortSignal): Promise<HealthStatus> {
    // Tier 1 — installed?
    try {
      const v = await run(this.codexPath, {
        args: ["--version"],
        timeoutMs: 10_000,
        signal
      });
      if (v.code !== 0) {
        return {
          state: "error",
          detail: `\`${this.codexPath} --version\` exited with code ${v.code}.`,
          remedy: INSTALL_REMEDY
        };
      }
    } catch (err) {
      if (err instanceof ExecutableNotFoundError) {
        return {
          state: "not-installed",
          detail: `Codex CLI ("${this.codexPath}") is not installed or not on PATH.`,
          remedy: INSTALL_REMEDY
        };
      }
      if (err instanceof TimeoutError) {
        return { state: "error", detail: "Timed out probing Codex." };
      }
      throw err;
    }

    // Tier 2 — authenticated? `codex login status` exits 0 when logged in and
    // spends zero tokens (unlike the Claude probe).
    try {
      const probe = await run(this.codexPath, {
        args: ["login", "status"],
        timeoutMs: 10_000,
        signal
      });
      if (probe.code === 0) {
        return { state: "healthy", detail: "Codex is installed and signed in." };
      }
      const detail = (probe.stderr || probe.stdout).trim();
      return {
        state: "not-logged-in",
        detail: detail || "Codex is installed but not signed in.",
        remedy: LOGIN_REMEDY
      };
    } catch (err) {
      if (err instanceof TimeoutError) {
        return { state: "error", detail: "Timed out while checking Codex sign-in." };
      }
      if (err instanceof ExecutableNotFoundError) {
        return {
          state: "not-installed",
          detail: `Codex CLI ("${this.codexPath}") is not installed or not on PATH.`,
          remedy: INSTALL_REMEDY
        };
      }
      throw err;
    }
  }
}
```

- [ ] **Step 2: Verify it compiles and nothing regresses**

Run: `npm run typecheck && npm run test`
Expected: clean / all PASS. (The provider is thin process glue with no new
pure logic — output cleanup is already covered by `core/parse.ts`; end-to-end
behavior is verified in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/providers/CodexProvider.ts
git commit -m "Add CodexProvider wrapping codex exec headless mode"
```

---

### Task 4: Wire engine selection in extension.ts

**Files:**
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `readConfig().engine` / `.codexPath` (Task 2), `CodexProvider` (Task 3), `AIProvider` interface.

- [ ] **Step 1: Switch buildProvider on the engine setting**

In `src/extension.ts`, add imports:

```ts
import { AIProvider } from "./providers/AIProvider.js";
import { CodexProvider } from "./providers/CodexProvider.js";
```

Replace `buildProvider`:

```ts
function buildProvider(): AIProvider {
  const cfg = readConfig();
  if (cfg.engine === "codex") {
    return new CodexProvider({
      codexPath: cfg.codexPath,
      timeoutMs: cfg.requestTimeoutMs
    });
  }
  return new ClaudeCodeProvider({
    claudePath: cfg.claudePath,
    timeoutMs: cfg.requestTimeoutMs
  });
}
```

(`let provider = buildProvider()` and the config-change rebuild already work
unchanged — the listener watches the whole `onesub.*` namespace.)

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run test && npm run bundle`
Expected: clean / PASS / `dist/extension.js` rebuilt.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "Select engine from onesub.engine setting"
```

---

### Task 5: Docs + end-to-end verification

**Files:**
- Modify: `README.md` (Requirements + Settings sections, architecture tree line)

**Interfaces:** none (docs + manual verification).

- [ ] **Step 1: Update README**

In `README.md`:

1. In **Requirements**, replace the single Claude bullet with:

```markdown
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
```

2. In the **Settings** table, add rows:

```markdown
| `onesub.engine` | `claude-code` | Which engine runs the buttons: `claude-code` or `codex`. |
| `onesub.codexPath` | `codex` | Path to the Codex CLI if it isn't on `PATH`. |
```

3. In the **Architecture** tree, replace the AIProvider comment line
   `AIProvider.ts        engine interface (Codex can slot in later)` with:

```
│   ├─ AIProvider.ts        engine interface
│   ├─ ClaudeCodeProvider   wraps `claude -p` headless; health probe
│   └─ CodexProvider        wraps `codex exec` headless; `codex login status` probe
```

   and delete the now-stale sentence "The engine is behind `AIProvider`, so
   adding **Codex** later is a second adapter with no UI changes." — replace
   with: "The engines live behind `AIProvider`; adding another CLI engine is
   one more adapter with no UI changes."

- [ ] **Step 2: End-to-end smoke test of the Codex path**

Exercise the provider outside VS Code first (same code path as `run()`):

```bash
printf 'Reply with the single word: OK' | codex exec --skip-git-repo-check -s read-only --ephemeral --color never -o /tmp/onesub-e2e.txt - && cat /tmp/onesub-e2e.txt
```

Expected: prints `OK` (possibly with punctuation). Also verify health probe:

```bash
codex login status; echo "exit=$?"
```

Expected: `Logged in using ChatGPT`, `exit=0`.

Then F5 in VS Code, set `"onesub.engine": "codex"` in the dev-host settings,
run **OneSub: Re-check Engine** — status bar shows healthy — and run
**Explain Selection** on any snippet; a markdown explanation should open.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Codex engine option"
```
