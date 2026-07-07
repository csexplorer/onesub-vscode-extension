// Pure prompt builders. Each button is a fixed template over real editor/git
// context — no chat. Kept vscode-free so they are unit-testable.

export type CommitConvention = "conventional" | "plain";

/**
 * Build the prompt that turns a staged diff into a commit message.
 * The instruction insists on message-only output so the result can be dropped
 * straight into the Source Control box.
 */
export function buildCommitPrompt(diff: string, convention: CommitConvention): string {
  const style =
    convention === "conventional"
      ? "Follow the Conventional Commits spec: a `type(scope): summary` subject " +
        "line (types: feat, fix, docs, style, refactor, perf, test, build, ci, chore). " +
        "Use an imperative summary under 72 characters."
      : "Write a concise imperative summary line under 72 characters.";

  return [
    "You are writing a git commit message for the following staged changes.",
    style,
    "Add a short body only if the change is non-trivial; otherwise output the subject line alone.",
    "Output ONLY the commit message. No preamble, no explanation, no code fences, no quotes.",
    "",
    "Staged diff:",
    "```diff",
    diff.trim(),
    "```"
  ].join("\n");
}

/** Build the prompt that explains a selected snippet in plain language. */
export function buildExplainPrompt(code: string, languageId: string): string {
  return [
    `Explain the following ${languageId || "code"} snippet in plain language.`,
    "Cover what it does, notable edge cases, and any obvious bug or smell.",
    "Be concise. Use short paragraphs or bullet points. Do not repeat the code back verbatim.",
    "",
    "```" + (languageId || ""),
    code.trim(),
    "```"
  ].join("\n");
}

/**
 * Build the prompt that produces a doc comment for a snippet.
 * Output is the comment only, so it can be inserted directly above the symbol.
 */
export function buildDocstringPrompt(code: string, languageId: string): string {
  return [
    `Write an idiomatic documentation comment for the following ${languageId || "code"}.`,
    "Use the language's standard doc style (JSDoc for JS/TS, docstring for Python, /// for Rust, etc.).",
    "Document parameters, return value, and thrown errors where they apply.",
    "Output ONLY the comment block. No code fences, no surrounding code, no explanation.",
    "",
    "```" + (languageId || ""),
    code.trim(),
    "```"
  ].join("\n");
}
