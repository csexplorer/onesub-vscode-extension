// Health manager: caches the engine's health, reflects it in a status-bar item,
// and gates the feature commands. On activation we probe once (background); a
// button used while unhealthy routes the user to guidance instead of failing.
import * as vscode from "vscode";
import { BRAND } from "../brand.js";
import { AIProvider, HealthStatus } from "../providers/AIProvider.js";
import { log } from "./output.js";

export class HealthManager {
  private status: HealthStatus | undefined;
  private readonly item: vscode.StatusBarItem;

  constructor(private provider: AIProvider) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = `${BRAND.id}.recheckHealth`;
    this.render();
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  /** Swap the engine (e.g. after a settings change) and invalidate the cache. */
  setProvider(provider: AIProvider): void {
    this.provider = provider;
    this.status = undefined;
  }

  get current(): HealthStatus | undefined {
    return this.status;
  }

  /** Re-probe the engine, updating the cache, status bar, and context key. */
  async refresh(): Promise<HealthStatus> {
    this.item.text = `$(sync~spin) ${BRAND.name}`;
    this.item.tooltip = `${BRAND.name}: checking ${this.provider.name}…`;
    try {
      this.status = await this.provider.checkHealth();
    } catch (err) {
      this.status = {
        state: "error",
        detail: err instanceof Error ? err.message : String(err)
      };
    }
    log(`health: ${this.status.state} — ${this.status.detail}`);
    this.render();
    await vscode.commands.executeCommand(
      "setContext",
      `${BRAND.id}.ready`,
      this.status.state === "healthy"
    );
    return this.status;
  }

  /**
   * Ensure the engine is ready before running a feature. Returns true when
   * healthy; otherwise probes (if unknown), shows guidance, and returns false.
   */
  async ensureReady(): Promise<boolean> {
    if (!this.status) {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: `${BRAND.name}: checking engine…` },
        () => this.refresh()
      );
    }
    if (this.status?.state === "healthy") {
      return true;
    }
    await this.showGuidance(this.status);
    return false;
  }

  private async showGuidance(status: HealthStatus | undefined): Promise<void> {
    if (!status) return;
    const actions: string[] = [];
    if (status.remedy) actions.push("Copy Command");
    actions.push("Re-check");

    const choice = await vscode.window.showWarningMessage(
      `${BRAND.name}: ${status.detail}`,
      ...actions
    );
    if (choice === "Copy Command" && status.remedy) {
      await vscode.env.clipboard.writeText(status.remedy);
      vscode.window.showInformationMessage(`Copied: ${status.remedy}`);
    } else if (choice === "Re-check") {
      await this.refresh();
    }
  }

  private render(): void {
    const s = this.status?.state;
    if (s === "healthy") {
      this.item.text = `$(sparkle) ${BRAND.name}`;
      this.item.tooltip = `${BRAND.name}: ${this.provider.name} ready`;
      this.item.backgroundColor = undefined;
    } else if (s === undefined) {
      this.item.text = `$(sparkle) ${BRAND.name}`;
      this.item.tooltip = `${BRAND.name}: engine status unknown — click to check`;
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = `$(warning) ${BRAND.name}`;
      this.item.tooltip = `${BRAND.name}: ${this.status?.detail ?? "not ready"} — click to re-check`;
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
  }
}
