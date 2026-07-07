# Solo — v1 Plan & Design Decisions

This is the locked spec produced by a design grilling session. Each decision
records the choice and the reason it beat the alternative.

## Product shape

1. **VS Code extension, not a fork.** A fork means merging Microsoft's monthly
   releases forever + losing the MS Marketplace (the trap that hit Cursor /
   VSCodium). An extension gets the same subscription integration for ~1% of the
   maintenance cost and auto-updates with VS Code.
2. **Brand Level A** — a branded extension (own name, logo, marketplace page).
   A standalone-app brand (own dock icon = repackaging VSCodium, the Cursor
   model) is deferred until the core value is validated.
3. **Portfolio / OSS intent for v1.** A free wrapper around the user's own CLI
   has no token margin and no lock-in, so there is nothing to monetize yet.
   Build it sharp, ship it, discover what teams would pay for afterward.

## Engine

4. **M1 — wrap the official `claude` CLI** (headless `-p` print mode, prompt via
   stdin). We never touch tokens or credentials; the CLI owns subscription auth.
   Rejected M2 (reverse-engineering subscription tokens): violates ToS, risks
   account bans, breaks on every auth rotation.
5. **Claude Code only in v1**, behind the `AIProvider` interface. Codex slots in
   later as a second adapter with no UI rework. Shipping two engines at once
   would double the auth/output/error surface before validating anything.

## Surface — three buttons, no chat

6. **S2 (one-click buttons), not S1 (chat panel).** A chat panel is the whole
   rest of the iceberg and puts us head-to-head with Cline/Continue doing what
   they already do well. The buttons are the actual differentiator and are
   finishable.
7. Exactly **three** buttons, sharing one pipeline
   (*gather context → `AIProvider.run` → apply result*):
   - **Generate Commit Message** (flagship) — SCM title bar.
   - **Explain Selection** — editor context menu + Command Palette.
   - **Generate Docstring** — editor context menu + Command Palette.

## Flagship behaviour

8. **Fill-only, never auto-commit.** Filling the box removes 100% of the tedium
   while keeping the 2-second human glance that catches a bad message. Auto-
   commit (AI writing *and* executing a git action unreviewed) is a v2 opt-in at
   most.
9. **Refuse oversized diffs** (default > 400 changed lines) with a message,
   rather than truncating — a truncated diff yields a misleading commit message.

## Reliability

10. **Activation health-check** with three states:
    - Healthy → buttons work.
    - Not installed → guidance + "Copy Command" (install) + "Re-check".
    - Installed, not signed in → guidance + "Re-check".
    Probed in the background on activation; status shown in the status bar.
    A button used while unhealthy routes to guidance instead of failing.
    We only detect and guide — never auto-install, never touch credentials.
11. **Failures:** an error **toast** with a **"Show Output"** action; raw
    stderr / exit code logged to the **Output channel**. The target (commit box,
    editor, panel) is **never partially written** on failure. Slow calls show a
    cancellable progress notification so they don't read as a hang.

## Deferred (reversible — decide inline, revisit later)

- Codex adapter (second `AIProvider`).
- Auto-commit opt-in setting.
- Chat panel.
- Standalone-app brand (Level B).
- Exact diff threshold tuning; Conventional-Commits vs plain default.
- Publish targets (MS Marketplace + Open VSX) and packaging/signing.

## Status

Engine (M1) verified end-to-end against the real `claude` subscription CLI:
health probe returns `healthy`; a staged diff produced
`fix(auth): fix off-by-one in token expiration check`. Pure core is unit-tested
(13 tests); the whole extension typechecks and bundles. The VS Code UI layer
runs in the Extension Development Host (<kbd>F5</kbd>).
