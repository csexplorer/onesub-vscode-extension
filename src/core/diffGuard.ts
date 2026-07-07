// Pure, vscode-free logic for gating oversized diffs.
// The flagship "Generate Commit Message" refuses diffs bigger than a
// configured threshold rather than truncating (a truncated diff produces a
// misleading message) — a decision locked during design.

export interface DiffSize {
  /** Number of added/removed content lines (excludes file headers/hunks). */
  changedLines: number;
  /** Number of distinct files touched. */
  changedFiles: number;
}

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
  return { changedLines, changedFiles };
}

export interface DiffVerdict {
  ok: boolean;
  size: DiffSize;
  /** Present only when ok === false. */
  reason?: string;
}

/**
 * Decide whether a staged diff is small enough to summarise.
 * Returns ok:false with a human reason when empty or over the limit.
 */
export function checkDiff(diff: string, maxLines: number): DiffVerdict {
  const size = measureDiff(diff);
  if (size.changedLines === 0) {
    return { ok: false, size, reason: "Nothing is staged. Stage changes first." };
  }
  if (size.changedLines > maxLines) {
    return {
      ok: false,
      size,
      reason:
        `Staged diff is too large (${size.changedLines} changed lines across ` +
        `${size.changedFiles} file(s); limit is ${maxLines}). ` +
        `Commit in smaller chunks, or raise "solo.diffMaxLines".`
    };
  }
  return { ok: true, size };
}
