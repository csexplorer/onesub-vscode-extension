// Thin promisified wrapper around child_process.spawn with timeout, abort, and
// optional stdin. vscode-free so it can be reused and reasoned about in isolation.
import { spawn } from "node:child_process";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  args?: string[];
  cwd?: string;
  /** Written to the child's stdin, then stdin is closed. */
  input?: string;
  /** Abort after this many ms. */
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

/** Raised when the executable cannot be found on disk / PATH. */
export class ExecutableNotFoundError extends Error {
  constructor(public readonly command: string) {
    super(`Executable not found: ${command}`);
    this.name = "ExecutableNotFoundError";
  }
}

/** Raised when the process is killed for exceeding its time budget. */
export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Process timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Run `command` and resolve with its exit code and captured output.
 * Rejects with ExecutableNotFoundError (ENOENT), TimeoutError, or an
 * AbortError — never with a non-zero exit (inspect result.code for that).
 */
export function run(command: string, opts: RunOptions = {}): Promise<RunResult> {
  const { args = [], cwd, input, timeoutMs, signal, env } = opts;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const child = spawn(command, args, { cwd, env });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onAbort = () => {
      child.kill("SIGTERM");
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    };

    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        finish(() => reject(new TimeoutError(timeoutMs)));
      }, timeoutMs);
    }

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(() =>
        err.code === "ENOENT"
          ? reject(new ExecutableNotFoundError(command))
          : reject(err)
      );
    });

    child.on("close", (code) => {
      finish(() => resolve({ code, stdout, stderr }));
    });

    if (input !== undefined) {
      child.stdin?.end(input);
    } else {
      child.stdin?.end();
    }
  });
}
