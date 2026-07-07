// Flagship: read the staged diff, generate a commit message, and FILL the
// Source Control input box — never auto-commit (human stays in the loop).
// If nothing is staged, stages everything (git add -A) first so the button
// works from a dirty working tree. Oversized diffs are refused, not
// truncated. On any failure the commit box is left untouched (no partial write).
import * as vscode from "vscode";
import { FeatureDeps } from "./deps.js";
import { readConfig } from "../config.js";
import { checkDiff } from "../core/diffGuard.js";
import { buildCommitPrompt } from "../core/prompts.js";
import { cleanCommitMessage } from "../core/parse.js";
import { pickRepository, getStagedDiff, setCommitMessage, stageAll, NoRepositoryError } from "../git.js";
import { withBusy, isCancellation } from "../ui/progress.js";
import { showError, log } from "../ui/output.js";
import { BRAND } from "../brand.js";

export async function generateCommitMessage(deps: FeatureDeps): Promise<void> {
  if (!(await deps.health.ensureReady())) return;
  const cfg = readConfig();

  let repo;
  try {
    repo = pickRepository();
  } catch (err) {
    if (err instanceof NoRepositoryError) {
      vscode.window.showWarningMessage(`${BRAND.name}: ${err.message}`);
      return;
    }
    await showError("locating repository", err);
    return;
  }

  try {
    let diff = await getStagedDiff(repo);
    if (!diff.trim()) {
      await stageAll(repo);
      diff = await getStagedDiff(repo);
    }
    const verdict = checkDiff(diff, cfg.diffMaxLines);
    if (!verdict.ok) {
      // Refuse — commit box left untouched.
      vscode.window.showWarningMessage(`${BRAND.name}: ${verdict.reason}`);
      return;
    }
    log(`commit: generating from ${verdict.size.changedLines} changed lines`);

    const raw = await withBusy("generating commit message…", (signal) =>
      deps.provider.run({
        prompt: buildCommitPrompt(diff, cfg.commitConvention),
        cwd: repo.rootUri.fsPath,
        timeoutMs: cfg.requestTimeoutMs,
        signal
      })
    );

    const message = cleanCommitMessage(raw);
    if (!message) {
      await showError("generating commit message", new Error("Empty message after cleanup."));
      return;
    }
    // Only now do we write — a single, complete update.
    setCommitMessage(repo, message);
    vscode.window.setStatusBarMessage(`$(check) ${BRAND.name}: commit message ready`, 4000);
  } catch (err) {
    if (isCancellation(err)) return;
    await showError("generating commit message", err);
  }
}
