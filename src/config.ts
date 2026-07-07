// Typed access to the extension's settings.
import * as vscode from "vscode";
import { BRAND } from "./brand.js";
import { CommitConvention } from "./core/prompts.js";

export interface SoloConfig {
  claudePath: string;
  diffMaxLines: number;
  commitConvention: CommitConvention;
  requestTimeoutMs: number;
}

export function readConfig(): SoloConfig {
  const c = vscode.workspace.getConfiguration(BRAND.id);
  const convention = c.get<string>("commitConvention", "conventional");
  return {
    claudePath: c.get<string>("claudePath", "claude"),
    diffMaxLines: c.get<number>("diffMaxLines", 400),
    commitConvention: convention === "plain" ? "plain" : "conventional",
    requestTimeoutMs: c.get<number>("requestTimeoutMs", 60_000)
  };
}
