// Pure, vscode-free logic for gating oversized diffs.
// The flagship "Generate Commit Message" refuses diffs bigger than a
// configured threshold rather than truncating (a truncated diff produces a
// misleading message) — a decision locked during design.

export interface DiffSize {
  /** Number of added/removed content lines (excludes file headers/hunks). */
  changedLines: number;
  /** Number of distinct files touched. */
  changedFiles: number;
  /** Raw size of the diff in characters — what the engine actually ingests. */
  chars: number;
}

/**
 * Default character ceiling for a staged diff.
 * Engines reject prompts above ~1,048,576 characters outright; cap the diff
 * well below that so the surrounding prompt text always fits.
 */
export const DEFAULT_DIFF_MAX_CHARS = 200_000;

/**
 * Count the changed lines and files in a unified `git diff`.
 * Content lines start with a single `+` or `-`; file markers (`+++`/`---`)
 * and hunk headers (`@@`) are ignored.
 */
export function measureDiff(diff: string): DiffSize {
  let changedLines = 0;
  let changedFiles = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      changedFiles++;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+") || line.startsWith("-")) {
      changedLines++;
    }
  }
  return { changedLines, changedFiles, chars: diff.length };
}

export interface DiffVerdict {
  ok: boolean;
  size: DiffSize;
  /** Present only when ok === false. */
  reason?: string;
}

/**
 * Decide whether a staged diff is small enough to summarise.
 * Returns ok:false with a human reason when empty or over a limit.
 * maxLines <= 0 disables the line check; maxChars <= 0 disables the char check.
 *
 * The character check is the one that keeps the engine from rejecting the
 * request: a line count says nothing about payload size (a single minified
 * CSS or bundled file is one line and tens of kilobytes), so a diff can pass
 * the line check and still blow past the engine's input ceiling.
 */
export function checkDiff(
  diff: string,
  maxLines: number,
  maxChars: number = DEFAULT_DIFF_MAX_CHARS
): DiffVerdict {
  const size = measureDiff(diff);
  if (size.changedLines === 0) {
    return { ok: false, size, reason: "Nothing is staged. Stage changes first." };
  }
  if (maxChars > 0 && size.chars > maxChars) {
    return {
      ok: false,
      size,
      reason:
        `Staged diff is too large (${size.chars.toLocaleString()} characters across ` +
        `${size.changedFiles} file(s); limit is ${maxChars.toLocaleString()}). ` +
        `The engine rejects prompts this big. Commit in smaller chunks, or raise ` +
        `"onesub.diffMaxChars".`
    };
  }
  if (maxLines > 0 && size.changedLines > maxLines) {
    return {
      ok: false,
      size,
      reason:
        `Staged diff is too large (${size.changedLines} changed lines across ` +
        `${size.changedFiles} file(s); limit is ${maxLines}). ` +
        `Commit in smaller chunks, or raise "onesub.diffMaxLines".`
    };
  }
  return { ok: true, size };
}
