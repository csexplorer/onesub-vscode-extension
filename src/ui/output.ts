// Output channel + error surfacing. Every failure becomes a toast with a
// "Show Output" action; raw engine stderr/exit detail is logged to the channel
// for debugging. Targets (commit box / editor) are never written to on failure.
import * as vscode from "vscode";
import { BRAND } from "../brand.js";
import { AIProviderError } from "../providers/AIProvider.js";

let channel: vscode.OutputChannel | undefined;

export function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(BRAND.name);
  }
  return channel;
}

export function disposeChannel(): void {
  channel?.dispose();
  channel = undefined;
}

function stamp(): string {
  // Date is only used for log readability; extension host allows it.
  return new Date().toISOString();
}

export function log(message: string): void {
  getChannel().appendLine(`[${stamp()}] ${message}`);
}

export function logError(context: string, err: unknown): void {
  const ch = getChannel();
  ch.appendLine(`[${stamp()}] ERROR during ${context}:`);
  if (err instanceof AIProviderError) {
    ch.appendLine(`  ${err.message}`);
    if (err.detail) ch.appendLine(`  detail: ${err.detail}`);
  } else if (err instanceof Error) {
    ch.appendLine(`  ${err.name}: ${err.message}`);
    if (err.stack) ch.appendLine(err.stack);
  } else {
    ch.appendLine(`  ${String(err)}`);
  }
}

/**
 * Show an error toast with a "Show Output" action and log the full detail.
 * Returns a promise that resolves once the toast is dismissed/acted on.
 */
export async function showError(context: string, err: unknown): Promise<void> {
  logError(context, err);
  const summary =
    err instanceof AIProviderError || err instanceof Error
      ? err.message
      : String(err);
  const choice = await vscode.window.showErrorMessage(
    `${BRAND.name}: ${summary}`,
    "Show Output"
  );
  if (choice === "Show Output") {
    getChannel().show(true);
  }
}
