// stderr fragments that mean "installed but not authenticated". Shared by all
// CLI providers; vscode-free.
const AUTH_PATTERNS = [
  /log(ged)? ?in/i, // "log in", "login", "logged in", "codex login"
  /sign ?in/i,
  /authenticat/i,
  /unauthori[sz]ed/i,
  /credential/i,
  /api key/i,
  /\b401\b/,
  /\b403\b/
];

export function looksLikeAuthFailure(text: string): boolean {
  return AUTH_PATTERNS.some((re) => re.test(text));
}
