// Entry point: build the provider from settings, wire the health manager, and
// register the four commands. The engine is probed in the background on
// activation so the status bar reflects readiness without blocking startup.
import * as vscode from "vscode";
import { BRAND } from "./brand.js";
import { readConfig } from "./config.js";
import { AIProvider } from "./providers/AIProvider.js";
import { ClaudeCodeProvider } from "./providers/ClaudeCodeProvider.js";
import { CodexProvider } from "./providers/CodexProvider.js";
import { HealthManager } from "./ui/health.js";
import { getChannel, disposeChannel, log } from "./ui/output.js";
import { FeatureDeps } from "./features/deps.js";
import { generateCommitMessage } from "./features/generateCommit.js";
import { explainSelection } from "./features/explainSelection.js";
import { generateDocstring } from "./features/generateDocstring.js";

let health: HealthManager | undefined;

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

export function activate(context: vscode.ExtensionContext): void {
  getChannel();
  log(`${BRAND.name} activated`);

  // Make sure the built-in Git extension is live so repository lookup works.
  void vscode.extensions.getExtension("vscode.git")?.activate();

  // Rebuildable provider reference so settings changes take effect.
  let provider = buildProvider();
  health = new HealthManager(provider);
  const deps: FeatureDeps = { provider, health };

  // Probe the engine in the background — never block activation on it.
  void health.refresh();

  context.subscriptions.push(
    health,
    { dispose: disposeChannel },
    vscode.commands.registerCommand(`${BRAND.id}.generateCommitMessage`, () =>
      generateCommitMessage(deps)
    ),
    vscode.commands.registerCommand(`${BRAND.id}.explainSelection`, () =>
      explainSelection(deps)
    ),
    vscode.commands.registerCommand(`${BRAND.id}.generateDocstring`, () =>
      generateDocstring(deps)
    ),
    vscode.commands.registerCommand(`${BRAND.id}.recheckHealth`, () =>
      health!.refresh()
    ),
    // Rebuild the provider when relevant settings change.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(BRAND.id)) {
        provider = buildProvider();
        deps.provider = provider;
        health!.setProvider(provider);
        void health!.refresh();
      }
    })
  );
}

export function deactivate(): void {
  health?.dispose();
  disposeChannel();
}
