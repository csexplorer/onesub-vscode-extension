// The engine abstraction. v1 ships one implementation (Claude Code) but every
// feature depends only on this interface, so a Codex adapter can slot in later
// with no UI rework — a decision locked during design.

export type HealthState = "healthy" | "not-installed" | "not-logged-in" | "error";

/**
 * Result of a health check for a CLI tool or dependency.
 */
export interface HealthStatus {
  state: HealthState;
  /** Short human explanation, shown in tooltips / walkthrough. */
  detail: string;
  /** Suggested shell command to fix it (install / login), when applicable. */
  remedy?: string;
}

export interface AIRequest {
  prompt: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Raised by run() when the engine is reachable but the call failed. */
export class AIProviderError extends Error {
  constructor(message: string, public readonly detail?: string) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface AIProvider {
  /** Human-facing engine name, e.g. "Claude Code". */
  readonly name: string;
  /** Run one prompt and resolve with the model's text output. */
  run(req: AIRequest): Promise<string>;
  /** Detect whether the engine is installed and authenticated. */
  checkHealth(signal?: AbortSignal): Promise<HealthStatus>;
}
