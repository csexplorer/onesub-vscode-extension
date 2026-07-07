// Git access. We use the built-in vscode.git extension API to locate the
// repository and to write the commit message into the Source Control input box,
// and shell `git diff --staged` for the raw diff text (the API exposes changes
// as structured objects, but we want the unified diff to feed the model).
import * as vscode from "vscode";
import { run } from "./core/exec.js";

// Minimal shapes of the git extension API we rely on.
interface GitInputBox {
  value: string;
}
interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: GitInputBox;
}
interface GitAPI {
  repositories: GitRepository[];
}

export class NoRepositoryError extends Error {
  constructor() {
    super("No Git repository found in this window.");
    this.name = "NoRepositoryError";
  }
}

export function getGitApi(): GitAPI | undefined {
  const ext = vscode.extensions.getExtension<{ getAPI(v: number): GitAPI }>("vscode.git");
  if (!ext) return undefined;
  const exports = ext.isActive ? ext.exports : undefined;
  return exports?.getAPI(1);
}

/**
 * Pick the repository to act on: the one containing the active editor's file
 * when it can be determined, otherwise the first repository. Throws
 * NoRepositoryError when none are open.
 */
export function pickRepository(): GitRepository {
  const api = getGitApi();
  const repos = api?.repositories ?? [];
  if (repos.length === 0) {
    throw new NoRepositoryError();
  }
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && repos.length > 1) {
    const match = repos
      .filter((r) => activeUri.fsPath.startsWith(r.rootUri.fsPath))
      .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0];
    if (match) return match;
  }
  return repos[0];
}

/** Return the staged (index vs HEAD) unified diff for a repository. */
export async function getStagedDiff(repo: GitRepository): Promise<string> {
  const result = await run("git", {
    args: ["diff", "--staged", "--no-color"],
    cwd: repo.rootUri.fsPath,
    timeoutMs: 15_000
  });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `git diff exited with code ${result.code}`);
  }
  return result.stdout;
}

/** Stage every tracked/untracked change in the repository (`git add -A`). */
export async function stageAll(repo: GitRepository): Promise<void> {
  const result = await run("git", {
    args: ["add", "-A"],
    cwd: repo.rootUri.fsPath,
    timeoutMs: 15_000
  });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `git add exited with code ${result.code}`);
  }
}

/** Write the generated message into the Source Control input box. */
export function setCommitMessage(repo: GitRepository, message: string): void {
  repo.inputBox.value = message;
}
