// Typed access to the extension's settings.
import * as vscode from "vscode";
import { BRAND } from "./brand.js";
import { CommitConvention } from "./core/prompts.js";
import { DEFAULT_DIFF_MAX_CHARS } from "./core/diffGuard.js";

export type EngineId = "claude-code" | "codex";

export interface OneSubConfig {
  engine: EngineId;
  claudePath: string;
  codexPath: string;
  diffMaxLines: number;
  diffMaxChars: number;
  commitConvention: CommitConvention;
  requestTimeoutMs: number;
}

export function readConfig(): OneSubConfig {
  const c = vscode.workspace.getConfiguration(BRAND.id);
  const convention = c.get<string>("commitConvention", "conventional");
  const engine = c.get<string>("engine", "claude-code");
  // Executable paths are marked "restricted" in package.json so VS Code
  // withholds workspace-provided overrides until the folder is trusted, but
  // we don't rely on that alone: force the safe PATH-resolved default in an
  // untrusted workspace regardless, since a repo's .vscode/settings.json is
  // attacker-controlled content and this value is spawned as a command.
  const trusted = vscode.workspace.isTrusted;
  return {
    engine: engine === "codex" ? "codex" : "claude-code",
    claudePath: trusted ? c.get<string>("claudePath", "claude") : "claude",
    codexPath: trusted ? c.get<string>("codexPath", "codex") : "codex",
    diffMaxLines: c.get<number>("diffMaxLines", 0),
    diffMaxChars: c.get<number>("diffMaxChars", DEFAULT_DIFF_MAX_CHARS),
    commitConvention: convention === "plain" ? "plain" : "conventional",
    requestTimeoutMs: c.get<number>("requestTimeoutMs", 60_000)
  };
}
