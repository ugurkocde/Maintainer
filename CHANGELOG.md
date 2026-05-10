# Changelog

All notable changes to Maintainer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] — 2026-05-10

### Added

- **Stronger duplicate-candidate search.** `findCandidateDuplicates` now combines a token-overlap query, a title-word OR-query, and the most-recently-updated open issues. The triage agent receives a richer pool (up to 12 candidates) and decides which are real duplicates.
- **Learn flow records `agent_steps`.** The `/maintainer learn` invocation appears on the dashboard timeline alongside triager, fixer, and reviewer.
- **Weekly PR reconciliation.** A new schedule task syncs each `pull_requests` row with the current GitHub state (merged, merged_at, ready_for_review), so the dashboard's "merged" counter and time-saved heuristic reflect human action on draft PRs.

## [2.2.0] — 2026-05-10

### Changed

- **FIX_PROMPT calls hallucination by name.** New rules forbid pasting file content into a text response and require `write_file` to be called before any "I fixed it" summary. The run is failed if `write_file` was never called, regardless of summary text.

### Fixed

- **Hallucination-detection nudge.** When the fixer ends without calling `write_file`, the flow inspects the final text for classic phrases ("I created", "now contains", "patch applied") and sends a sharper nudge that names the failure mode. Idle exits without those phrases get the standard "do it now" nudge.
- **Diff filter trigger.** The nudge condition now uses `writtenPaths.size === 0` instead of `git status` output, so side-effect mutations (npm install dirtying the lockfile) no longer mask the absence of real work.

## [2.1.1] — 2026-05-10

### Fixed

- **Diffs scoped to intentional writes.** `Workspace.writeFile` records every path the agent writes via the `write_file` tool. The fix flow filters changed files to that set, scopes `git diff` to those paths for the reviewer, and stages only those paths in the commit. Side-effect mutations (npm install touching `package-lock.json`, build artifacts) no longer leak into PRs or trip the reviewer.
- **Slash-command outcomes.** `/maintainer fix` (and other slash paths) now propagate their result through `RunState.outcome`. Previously the run row finished with `outcome=null` for any comment-triggered run; now it reads `fix_proposed`, `fix_failed`, `triage_only`, `context_generated`, etc.

## [2.1.0] — 2026-05-10

### Added

- **Reviewer specialist agent.** A second specialist sits between the Fixer and the PR. After tests pass, the Reviewer (Sonnet) reads the unified diff plus the issue context and decides approve / reject. On reject the PR is not opened; sticky comment lists specific concerns. Configurable via `review.enabled` and `review.block_on_reject`.

## [2.0.0] — 2026-05-10

### Added

- **GitHub App authentication.** Two new optional Action inputs (`app-id`, `app-private-key`) authenticate the run as a custom GitHub App. Comments and PRs are then attributed to the App's name and avatar instead of `github-actions[bot]`. Falls back to `GITHUB_TOKEN` when missing.

### Fixed

- **Porcelain prefix parsing.** `Workspace.listChangedFiles` previously over-ate into filenames whose first character was an uppercase letter (`IntuneBrew.ps1` became `ntuneBrew.ps1` in PR bodies and `pull_requests.files_changed`). The format is exactly 3 chars (`XY ` plus space); replaced regex with a literal `slice(3)`.

## [1.9.x] — 2026-05-10

### Added

- **Supabase telemetry.** The Action records every run plus per-agent steps to a Supabase project. Enables a real-time dashboard.
- **Cache-token tracking and budget weighting.** `cache_creation_input_tokens` (1.25×) and `cache_read_input_tokens` (0.1×) are read from each Anthropic response and applied to budget caps and cost estimates.
- **`/maintainer learn`.** Generates `.github/maintainer-context.md` so future fix and intent runs skip the exploration phase.

## [1.8.x] — 2026-05-09

### Added

- **Project-context document infrastructure.** Loader, generator, prompt injection in fix and intent flows.
- **429 retry.** SDK now retries 6 times with exponential backoff and respects `retry-after` headers.

## [1.7.x] — 2026-05-09

### Fixed

- **Budget weighting.** Cache_read tokens now count at billing rate (0.1×) against the input cap, not full weight. Fix runs no longer get cut off prematurely while real spend is still well under the cap.

## [1.0.0 – 1.6.x] — 2026-05-09

Initial release through several incremental fixes:

- GitHub Action with triage and fix agents, slash commands, `@maintainer` natural-language interface, weekly digest, dashboard mode.
- Prompt caching wired into all flows.
- Cost surface in run footer and PR body.
- PR creation idempotency, failure recovery, branch reuse.

[2.3.0]: https://github.com/ugurkocde/Maintainer/releases/tag/v2.3.0
[2.2.0]: https://github.com/ugurkocde/Maintainer/releases/tag/v2.2.0
[2.1.1]: https://github.com/ugurkocde/Maintainer/releases/tag/v2.1.1
[2.1.0]: https://github.com/ugurkocde/Maintainer/releases/tag/v2.1.0
[2.0.0]: https://github.com/ugurkocde/Maintainer/releases/tag/v2.0.0
