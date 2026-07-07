// Typed access to the extension's settings.
import * as vscode from "vscode";
import { BRAND } from "./brand.js";
import { CommitConvention } from "./core/prompts.js";

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
