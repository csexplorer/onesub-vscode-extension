// Pure output-cleanup helpers. Models sometimes wrap answers in code fences or
// prepend chatter ("Here is the commit message:") even when told not to; these
// normalise the result before it reaches a commit box or the editor.

/**
 * Strip a single surrounding triple-backtick fence, if present.
 * Leaves inner content untouched, including nested fences.
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```[^\n]*\n([\s\S]*?)\n?```$/;
  const m = trimmed.match(fence);
  return m ? m[1].trim() : trimmed;
}

const PREAMBLE = /^(sure[,!.]?\s*|here(?:'s| is)[^\n:]*:?\s*|commit message:?\s*)/i;

/**
 * Normalise a generated commit message: drop fences, strip a leading
 * "Here is ..." preamble, remove wrapping quotes, and collapse trailing blank
 * lines. Returns "" when nothing usable remains.
 */
export function cleanCommitMessage(text: string): string {
  let out = stripCodeFence(text);
  out = out.replace(PREAMBLE, "");
  out = out.trim();
  // Remove symmetric wrapping quotes/backticks around the whole message.
  const wrapped = /^(["'`])([\s\S]*)\1$/.exec(out);
  if (wrapped) {
    out = wrapped[2].trim();
  }
  // Collapse 3+ consecutive newlines to a single blank line.
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/** Cleanup for an inserted doc comment: drop fences, trim trailing whitespace. */
export function cleanDocComment(text: string): string {
  return stripCodeFence(text)
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
