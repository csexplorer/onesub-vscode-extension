import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeAuthFailure } from "./authPatterns.js";

test("detects classic auth failure fragments", () => {
  assert.equal(looksLikeAuthFailure("Please log in to continue"), true);
  assert.equal(looksLikeAuthFailure("error: not authenticated"), true);
  assert.equal(looksLikeAuthFailure("HTTP 401 Unauthorized"), true);
  assert.equal(looksLikeAuthFailure("invalid api key"), true);
});

test("detects codex-specific fragments", () => {
  assert.equal(looksLikeAuthFailure("Run `codex login` first"), true);
  assert.equal(looksLikeAuthFailure("Not logged in"), true);
});

test("ignores unrelated errors", () => {
  assert.equal(looksLikeAuthFailure("network unreachable"), false);
  assert.equal(looksLikeAuthFailure(""), false);
});
