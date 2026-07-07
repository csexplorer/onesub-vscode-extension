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
