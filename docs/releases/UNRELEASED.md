# Unreleased

<!--
  TEMPLATE — copy to docs/releases/UNRELEASED.md at the start of each release cycle:

      cp docs/releases/UNRELEASED.template.md docs/releases/UNRELEASED.md

  Edit UNRELEASED.md across the cycle (the working copy). NEVER edit this
  template directly — it's the cold-start structure, untouched between cycles.

  Per-PR architect workflow (on the docs/vscode-changelog branch):
    1. cd worktrees/changelog                       # no fetch / no rebase — branches diverge by design
    2. Add the CHANGELOG entry to packages/vscode/CHANGELOG.md under [Unreleased]
       (add the [Unreleased] heading if it's missing — post-release state removes it)
    3. Add the matching release-notes entry to UNRELEASED.md under the right section:
         substantive change → its own ## section
         small vscode item  → Polish
         non-vscode change  → Other fixes
    4. Commit both files together; plain `git push` (fast-forward, no force)

  Why no rebase, ever: main moves with code merges, docs/vscode-changelog moves
  with changelog/release-notes entries — neither branch touches the other's
  files, so they diverge by design and reconcile at release time via merge.
  Rebasing rewrites commit hashes and forces force-pushes for zero real benefit.

  At release time:
    1. Rename the title to `# vX.Y.Z <Codename>` and add `Released: YYYY-MM-DD`
    2. Replace this entire comment block with the release Summary paragraph
       (one paragraph framing what shipped — lead with the biggest story)
    3. Fill in the Contributors section at the bottom
    4. git mv docs/releases/UNRELEASED.md docs/releases/vX.Y.Z-<codename>.md
    5. Commit, plain push, merge to main alongside the version bump
    6. Re-cp the template back to UNRELEASED.md to start the next cycle
-->

## Code-review feedback: codelens in the unified diff editor injects file / hunk references into the builder PTY (#789, PR #1023)

Architect-side review used to slow down at one specific point: you'd see something in the unified diff editor, want to give the builder targeted feedback about it, switch to the builder PTY, and type the file path and line range by hand into the prompt before adding your actual feedback. The file path was the typing bottleneck — error-prone, slow, and outside the diff editor where your attention already was.

The unified diff editor now carries inline codelens entries that close that gap. Above each file header, `> Send to builder PTY` injects `path/to/file.ts ` into the builder's prompt buffer. Above each hunk header, `> Send to builder PTY (lines N-M)` injects `path/to/file.ts:L42-L58 ` (the new-side line range parsed from the hunk). Enter is never pressed; you add the freeform feedback and submit when ready. The builder is taken from the diff's context, so there's no picker and no mode error.

The same action is bound to `Cmd/Ctrl+K B` for keyboard-first use and is available as a right-click menu entry on builder files in the file tree. Direct PTY write, no `afx send` wrapper — the inject reads as if you typed it. If the builder doesn't have an active terminal, the resolver falls through to the existing terminal-manager open-terminal flow before injecting.

Modelled on the established `codev.referenceIssueInArchitect` pattern that injects `#<id> ` into the architect's prompt on backlog row clicks, extended to the builder side with file and hunk awareness.

## Polish

<!-- Small vscode items as bullets:
       - **<Headline>** (#<issue>, PR #<pr>). <One short paragraph of context.>
     Move out to its own ## section if the entry grows past ~3 sentences. -->

- **PR sidebar sorts by ownership, with a `(draft)` badge** (#787, PR #1019). The Pull Requests view used to render PRs in arbitrary forge order with no fast scan-path to the ones you'd authored or were asked to review, and no way to distinguish drafts. It now groups into one flat list ordered mine → review-requested → others, newest-first within each bucket; drafts carry a `(draft)` suffix and a draft icon. Two new fields (`reviewRequests`, `isDraft`) flow end-to-end through the forge concept; github + gitlab fully populate, gitea safely defaults because `tea pulls list` doesn't expose the fields. When `gh` is unavailable the list falls back to plain createdAt-desc with no crash.
- **CLI preflight no longer triggers a false "Get started with Codev" walkthrough on slow environments** (#1024, PR #1026). The startup CLI version probe used to cap at 400ms, too tight against the realistic 500-3500ms cold-spawn budget on remote SSH, WSL, `nvm` / `fnm` / `volta` shims, AV-scanning Windows, and network filesystems. A timed-out probe wrongly decided the CLI was missing and re-opened the walkthrough on every startup, even though `codev --version` succeeded from a terminal in the same window. The cap is now 5000ms by default and overrideable via a new `codev.cliVersionTimeoutMs` setting (range 100-60000ms) for users on extra-slow infra. Timeouts log a `[Preflight]` line to the Codev Output channel so the failure mode is diagnosable.

## Other fixes (dashboard, porch, infrastructure)

<!-- Non-vscode work that ships in the npm release. Same bullet shape as Polish. -->

## Breaking changes

None.

## Install

```bash
npm install -g @cluesmith/codev@X.Y.Z
afx tower stop && afx tower start
```

The VS Code extension ships separately via the Marketplace — `Codev` extension by `cluesmith.codev`, version `X.Y.Z`.

## Contributors

<!-- Filled at release time. Use the topic-first voice from prior release notes:
       - **<Name> (@<handle>)** — <topic>: <what they did across which PRs>.
       - Builders working under AIR / BUGFIX / PIR / SPIR protocols across the PRs in this release.
     Source: git log v<prev>..HEAD --merges --pretty=format:"%h %an %s" -->
