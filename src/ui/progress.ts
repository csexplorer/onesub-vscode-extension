// Run an async task under a cancellable progress notification, wiring VS Code's
// CancellationToken to an AbortSignal so the underlying CLI call is killed when
// the user cancels. Gives the "in-progress, not a hang" feedback for slow calls.
import * as vscode from "vscode";
import { BRAND } from "../brand.js";

export async function withBusy<T>(
  title: string,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `${BRAND.name}: ${title}`,
      cancellable: true
    },
    async (_progress, token) => {
      const controller = new AbortController();
      const sub = token.onCancellationRequested(() => controller.abort());
      try {
        return await fn(controller.signal);
      } finally {
        sub.dispose();
      }
    }
  );
}

/** True when an error represents a user/host cancellation, not a real failure. */
export function isCancellation(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
