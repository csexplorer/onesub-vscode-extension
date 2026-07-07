// Generate a doc comment for the selected code (or the current line when there
// is no selection) and insert it directly above, matching indentation.
// A single edit is applied only after a clean result — no partial writes.
import * as vscode from "vscode";
import { FeatureDeps } from "./deps.js";
import { readConfig } from "../config.js";
import { buildDocstringPrompt } from "../core/prompts.js";
import { cleanDocComment } from "../core/parse.js";
import { withBusy, isCancellation } from "../ui/progress.js";
import { showError } from "../ui/output.js";
import { BRAND } from "../brand.js";

export async function generateDocstring(deps: FeatureDeps): Promise<void> {
  if (!(await deps.health.ensureReady())) return;

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(`${BRAND.name}: open a file and place the cursor on the code to document.`);
    return;
  }

  const sel = editor.selection;
  const targetLine = sel.start.line;
  const range = sel.isEmpty ? editor.document.lineAt(targetLine).range : sel;
  const code = editor.document.getText(range);
  if (!code.trim()) {
    vscode.window.showWarningMessage(`${BRAND.name}: nothing to document on this line.`);
    return;
  }

  const cfg = readConfig();
  try {
    const raw = await withBusy("generating docstring…", (signal) =>
      deps.provider.run({
        prompt: buildDocstringPrompt(code, editor.document.languageId),
        cwd: vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath,
        timeoutMs: cfg.requestTimeoutMs,
        signal
      })
    );
    const comment = cleanDocComment(raw);
    if (!comment) {
      await showError("generating docstring", new Error("Empty comment after cleanup."));
      return;
    }

    const indent = leadingWhitespace(editor.document.lineAt(targetLine).text);
    const indented = comment
      .split("\n")
      .map((line) => (line.length ? indent + line : line))
      .join("\n");
    const insertPos = new vscode.Position(targetLine, 0);

    const applied = await editor.edit((builder) => {
      builder.insert(insertPos, indented + "\n");
    });
    if (!applied) {
      await showError("generating docstring", new Error("Editor rejected the insertion."));
      return;
    }
    vscode.window.setStatusBarMessage(`$(check) ${BRAND.name}: docstring inserted`, 4000);
  } catch (err) {
    if (isCancellation(err)) return;
    await showError("generating docstring", err);
  }
}

function leadingWhitespace(line: string): string {
  const m = line.match(/^[ \t]*/);
  return m ? m[0] : "";
}
