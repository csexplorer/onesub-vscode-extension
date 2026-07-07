// M1 engine: wrap the user's own `claude` (Claude Code) CLI in headless print
// mode. We never touch tokens or credentials — the CLI owns the subscription
// auth. The prompt is written to stdin so large diffs never hit arg-length
// limits or shell-escaping issues.
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

const INSTALL_REMEDY = "npm install -g @anthropic-ai/claude-code";
const LOGIN_REMEDY = "claude";

// stderr fragments that mean "installed but not authenticated".
const AUTH_PATTERNS = [
  /log ?in/i,
  /sign ?in/i,
  /authenticat/i,
  /unauthori[sz]ed/i,
  /not authenticated/i,
  /credential/i,
  /api key/i,
  /\b401\b/,
  /\b403\b/
];

function looksLikeAuthFailure(text: string): boolean {
  return AUTH_PATTERNS.some((re) => re.test(text));
}

export interface ClaudeCodeOptions {
  /** Path/name of the CLI. Defaults to "claude" (resolved via PATH). */
  claudePath?: string;
  /** Default per-request timeout. */
  timeoutMs?: number;
}

export class ClaudeCodeProvider implements AIProvider {
  readonly name = "Claude Code";
  private readonly claudePath: string;
  private readonly defaultTimeout: number;

  constructor(opts: ClaudeCodeOptions = {}) {
    this.claudePath = opts.claudePath?.trim() || "claude";
    this.defaultTimeout = opts.timeoutMs ?? 60_000;
  }

  async run(req: AIRequest): Promise<string> {
    let result;
    try {
      result = await run(this.claudePath, {
        args: ["-p"],
        input: req.prompt,
        cwd: req.cwd,
        timeoutMs: req.timeoutMs ?? this.defaultTimeout,
        signal: req.signal
      });
    } catch (err) {
      if (err instanceof ExecutableNotFoundError) {
        throw new AIProviderError(
          `Claude Code CLI ("${this.claudePath}") was not found.`,
          `Install it with: ${INSTALL_REMEDY}`
        );
      }
      if (err instanceof TimeoutError) {
        throw new AIProviderError(
          `Claude Code timed out after ${err.timeoutMs}ms.`,
          "The request was aborted. Try again or raise onesub.requestTimeoutMs."
        );
      }
      throw err; // AbortError / unexpected — let the caller handle.
    }

    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout).trim();
      if (looksLikeAuthFailure(detail)) {
        throw new AIProviderError(
          "Claude Code is not signed in.",
          detail || `Run \`${LOGIN_REMEDY}\` in a terminal and sign in.`
        );
      }
      throw new AIProviderError(
        `Claude Code exited with code ${result.code}.`,
        detail || "No error output."
      );
    }

    const text = result.stdout.trim();
    if (!text) {
      throw new AIProviderError(
        "Claude Code returned an empty response.",
        result.stderr.trim() || undefined
      );
    }
    return text;
  }

  async checkHealth(signal?: AbortSignal): Promise<HealthStatus> {
    // Tier 1 — installed? (cheap, no token spend)
    try {
      const v = await run(this.claudePath, {
        args: ["--version"],
        timeoutMs: 10_000,
        signal
      });
      if (v.code !== 0) {
        return {
          state: "error",
          detail: `\`${this.claudePath} --version\` exited with code ${v.code}.`,
          remedy: INSTALL_REMEDY
        };
      }
    } catch (err) {
      if (err instanceof ExecutableNotFoundError) {
        return {
          state: "not-installed",
          detail: `Claude Code CLI ("${this.claudePath}") is not installed or not on PATH.`,
          remedy: INSTALL_REMEDY
        };
      }
      if (err instanceof TimeoutError) {
        return { state: "error", detail: "Timed out probing Claude Code." };
      }
      throw err;
    }

    // Tier 2 — authenticated? A minimal print-mode call; costs a tiny amount of
    // quota, so callers cache the result and only re-run on demand.
    try {
      const probe = await run(this.claudePath, {
        args: ["-p"],
        input: "Reply with the single word: OK",
        timeoutMs: 20_000,
        signal
      });
      if (probe.code === 0 && probe.stdout.trim()) {
        return { state: "healthy", detail: "Claude Code is installed and signed in." };
      }
      const detail = (probe.stderr || probe.stdout).trim();
      if (looksLikeAuthFailure(detail)) {
        return {
          state: "not-logged-in",
          detail: "Claude Code is installed but not signed in.",
          remedy: LOGIN_REMEDY
        };
      }
      return {
        state: "error",
        detail: detail || `Health probe exited with code ${probe.code}.`
      };
    } catch (err) {
      if (err instanceof TimeoutError) {
        return { state: "error", detail: "Timed out while checking Claude Code sign-in." };
      }
      if (err instanceof ExecutableNotFoundError) {
        return {
          state: "not-installed",
          detail: `Claude Code CLI ("${this.claudePath}") is not installed or not on PATH.`,
          remedy: INSTALL_REMEDY
        };
      }
      throw err;
    }
  }
}
