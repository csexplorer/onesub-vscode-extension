import { test } from "node:test";
import assert from "node:assert/strict";
import { measureDiff, checkDiff } from "./diffGuard.js";
import { buildCommitPrompt, buildDocstringPrompt } from "./prompts.js";
import { stripCodeFence, cleanCommitMessage, cleanDocComment } from "./parse.js";

const SAMPLE_DIFF = [
  "diff --git a/foo.ts b/foo.ts",
  "index 111..222 100644",
  "--- a/foo.ts",
  "+++ b/foo.ts",
  "@@ -1,3 +1,4 @@",
  " context line",
  "-old line",
  "+new line one",
  "+new line two"
].join("\n");

test("measureDiff counts content lines, ignores headers", () => {
  const size = measureDiff(SAMPLE_DIFF);
  assert.equal(size.changedFiles, 1);
  // one removal + two additions = 3; headers/hunk excluded
  assert.equal(size.changedLines, 3);
});

test("measureDiff counts multiple files", () => {
  const two = SAMPLE_DIFF + "\n" + SAMPLE_DIFF.replace(/foo/g, "bar");
  assert.equal(measureDiff(two).changedFiles, 2);
});

test("checkDiff rejects empty diff", () => {
  const v = checkDiff("", 400);
  assert.equal(v.ok, false);
  assert.match(v.reason!, /Nothing is staged/);
});

test("checkDiff rejects oversized diff with counts in reason", () => {
  const v = checkDiff(SAMPLE_DIFF, 2);
  assert.equal(v.ok, false);
  assert.match(v.reason!, /too large/);
  assert.match(v.reason!, /3 changed lines/);
});

test("checkDiff accepts in-range diff", () => {
  const v = checkDiff(SAMPLE_DIFF, 400);
  assert.equal(v.ok, true);
  assert.equal(v.reason, undefined);
});

test("checkDiff maxLines=0 disables the size check", () => {
  const v = checkDiff(SAMPLE_DIFF, 0);
  assert.equal(v.ok, true);
  assert.equal(v.reason, undefined);
});

test("buildCommitPrompt embeds diff and convention wording", () => {
  const p = buildCommitPrompt("+a\n-b", "conventional");
  assert.match(p, /Conventional Commits/);
  assert.match(p, /Output ONLY the commit message/);
  assert.match(p, /\+a/);
});

test("buildCommitPrompt plain omits conventional wording", () => {
  const p = buildCommitPrompt("+a", "plain");
  assert.doesNotMatch(p, /Conventional Commits/);
});

test("buildDocstringPrompt asks for comment-only output", () => {
  const p = buildDocstringPrompt("function x(){}", "typescript");
  assert.match(p, /Output ONLY the comment/);
  assert.match(p, /typescript/);
});

test("stripCodeFence removes a single surrounding fence", () => {
  assert.equal(stripCodeFence("```ts\nconst a = 1;\n```"), "const a = 1;");
  assert.equal(stripCodeFence("no fence here"), "no fence here");
});

test("cleanCommitMessage strips preamble, fences, and wrapping quotes", () => {
  assert.equal(cleanCommitMessage("Here is the commit message:\nfix: bug"), "fix: bug");
  assert.equal(cleanCommitMessage("```\nfeat: add x\n```"), "feat: add x");
  assert.equal(cleanCommitMessage('"chore: tidy"'), "chore: tidy");
  assert.equal(cleanCommitMessage("Sure! docs: update"), "docs: update");
});

test("cleanCommitMessage collapses excess blank lines", () => {
  assert.equal(cleanCommitMessage("subject\n\n\n\nbody"), "subject\n\nbody");
});

test("cleanCommitMessage returns empty for junk-only", () => {
  assert.equal(cleanCommitMessage("```\n\n```"), "");
});

test("cleanDocComment strips fences and trailing whitespace", () => {
  assert.equal(cleanDocComment("```\n/** hi */   \n```"), "/** hi */");
});
