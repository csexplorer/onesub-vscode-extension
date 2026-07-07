// Explain the selected code in plain language, rendered in a transient markdown
// document beside the editor (no sidebar panel — chat was deliberately excluded).
import * as vscode from "vscode";
import { FeatureDeps } from "./deps.js";
import { readConfig } from "../config.js";
import { buildExplainPrompt } from "../core/prompts.js";
import { withBusy, isCancellation } from "../ui/progress.js";
import { showError } from "../ui/output.js";
import { BRAND } from "../brand.js";

export async function explainSelection(deps: FeatureDeps): Promise<void> {
  if (!(await deps.health.ensureReady())) return;

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(`${BRAND.name}: open a file and select some code first.`);
    return;
  }
  const code = editor.document.getText(editor.selection);
  if (!code.trim()) {
    vscode.window.showWarningMessage(`${BRAND.name}: select some code to explain.`);
    return;
  }

  const cfg = readConfig();
  try {
    const explanation = await withBusy("explaining selection…", (signal) =>
      deps.provider.run({
        prompt: buildExplainPrompt(code, editor.document.languageId),
        cwd: workspaceCwd(editor.document.uri),
        timeoutMs: cfg.requestTimeoutMs,
        signal
      })
    );
    await showMarkdownBeside(explanation);
  } catch (err) {
    if (isCancellation(err)) return;
    await showError("explaining selection", err);
  }
}

function workspaceCwd(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

async function showMarkdownBeside(markdown: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: "markdown"
  });
  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true
  });
  // Best-effort: render as a preview if the markdown feature is available.
  await vscode.commands
    .executeCommand("markdown.showPreview")
    .then(undefined, () => undefined);
}
