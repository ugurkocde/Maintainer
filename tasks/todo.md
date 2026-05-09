# Maintainer — v1 Plan

## Vision

A GitHub Action that promises **automatic maintenance of a repository**. Install it, set an Anthropic API key, and your issues get triaged, deduped, and — for scoped, reproducible bugs — fixed via draft PRs, all without human intervention. Long-term: a publishable product other maintainers install on their own repos.

## Locked decisions

- **Architecture:** pure GitHub-native. Distributed as a GitHub Action. No backend, no hosted infra, no sandbox layer (runners are the sandbox).
- **Auth:** `GITHUB_TOKEN` for repo writes (auto-injected). `ANTHROPIC_API_KEY` as repo or org secret (BYO).
- **Models:** Sonnet 4.6 for triage. Opus 4.7 for code fixing. Configurable via `.github/maintainer.yml`.
- **Runtime:** TypeScript + Node 20, bundled with `@vercel/ncc`, dist committed.
- **PR safety:** every fix opens as **draft** with `maintainer:needs-human-review` label. No auto-ready, no auto-merge in v1.
- **Fix scope filter:** agent only attempts PRs when triage classifies issue as scoped + reproducible. Vague feature requests stay triage-only.
- **Distribution:** public repo, then list on GitHub Marketplace once stable.

## Repo layout

```
maintainer/
  action.yml                 # Action manifest, inputs, branding
  package.json
  tsconfig.json
  src/
    index.ts                 # Entrypoint, routes by github.event_name
    config/
      schema.ts              # .github/maintainer.yml schema (zod)
      load.ts                # Config loader with defaults
    github/
      client.ts              # Octokit wrapper
      labels.ts              # Standard label set + auto-create
      issues.ts              # Issue read/comment/label helpers
      prs.ts                 # PR create/draft helpers
      search.ts              # Cross-issue/PR search for dedup
    agent/
      client.ts              # Anthropic client + Agent SDK setup
      tools.ts               # Tool definitions (file read, search, etc.)
      prompts/
        triage.md
        fix.md
        explain.md
    triage/
      run.ts                 # Triage flow
      classifier.ts          # Type/severity/scope helpers
      dedup.ts               # Duplicate detection
    fix/
      run.ts                 # Fix flow
      detect.ts              # Detect test command, language, framework
      pr.ts                  # Branch + commit + PR creation
    commands/
      router.ts              # Parse /maintainer <cmd> from comments
      handlers.ts            # triage, fix, skip, explain, dedupe
    dashboard/
      run.ts                 # Cross-repo aggregation (control-repo mode)
      render.ts              # STATUS.md generation
    schedule/
      stale.ts               # Stale issue sweep
      digest.ts              # Weekly briefing
    util/
      log.ts
      events.ts              # Event payload typing
  prompts/                   # Versioned prompt assets (loaded at runtime)
  test/
    fixtures/                # Sample event payloads
    *.test.ts
  dist/index.js              # ncc bundle (committed)
  .github/workflows/
    release.yml              # Build dist + tag on release
    test.yml                 # CI
  README.md
  LICENSE
  tasks/
    todo.md                  # this file
    lessons.md               # learnings from corrections
```

## Milestones

### M0 — Scaffolding [DONE]
- [x] Init `package.json` with TypeScript, `@actions/core`, `@actions/github`, `@octokit/rest`, `@anthropic-ai/sdk`, `zod`, `vitest`, `@vercel/ncc`
- [x] `tsconfig.json` for Node 20 (NodeNext, strict, ES2022)
- [x] `action.yml` manifest with inputs (`anthropic-api-key`, `github-token`, `mode`, `config-path`)
- [x] Branding (icon: tool, color: purple)
- [x] ncc build setup → `dist/index.js` (1.1MB bundle, source map included)
- [x] Release workflow `.github/workflows/release.yml`: tag-triggered, runs full `npm run all`, verifies dist matches source, updates rolling major-version tag, creates GitHub release
- [x] CI workflow `.github/workflows/test.yml`: typecheck + lint + test + build + dist-freshness check on push/PR to main
- [x] ESLint flat config (eslint.config.mjs) with TS rules
- [x] Vitest smoke test in `test/index.test.ts`
- [x] README quickstart with copy-pasteable workflow YAML
- [x] `src/index.ts` stub: reads inputs, masks secrets, routes by event name, logs and exits cleanly for unhandled events

**Acceptance:** Met. Local smoke test against the bundled `dist/index.js` with mocked Action env vars routes correctly through all five event types and exits cleanly. Full `npm run all` (typecheck + lint + test + build) passes green. Bundle is shippable.

### M1 — Event routing + config
- [ ] Entrypoint reads `GITHUB_EVENT_NAME` and `GITHUB_EVENT_PATH`, dispatches to handler
- [ ] Octokit client constructed from `GITHUB_TOKEN`
- [ ] Anthropic client constructed from input
- [ ] `.github/maintainer.yml` loader with zod schema, sane defaults if missing
- [ ] Standard label set auto-created on first run (`maintainer:bug`, `maintainer:needs-repro`, `maintainer:duplicate`, `maintainer:needs-human-review`, `maintainer:skip`, severity tiers)
- [ ] Structured logging via `@actions/core`

**Acceptance:** All five event types (`issues`, `issue_comment`, `pull_request`, `schedule`, `workflow_dispatch`) route to a stub handler. Config loader has 100% schema coverage in tests. Labels appear in target repo after first run.

### M2 — Triage agent
- [ ] Triggered on `issues.opened`, `issues.reopened`, `issues.edited`
- [ ] Search existing open + recently closed issues for duplicates (title + body similarity, GitHub search API)
- [ ] Search closed PRs for related fixes
- [ ] Classify: `bug` | `feature` | `question` | `support` | `spam`
- [ ] Detect missing repro; if missing on a `bug`, post templated checklist comment + apply `maintainer:needs-repro`
- [ ] Score severity (critical/high/medium/low)
- [ ] Score fixable scope (scoped / multi-file / architectural / not-actionable)
- [ ] Apply labels
- [ ] Post one structured triage comment
- [ ] Skip entirely if `maintainer:skip` label present

**Acceptance:** Run against a curated set of 20 real issues from one of the user's existing repos. Manual eval: ≥80% of triage comments are accurate (correct type, severity within one tier, dedup links correct, no hallucinated references). Eval is run by a separate `feature-dev:code-reviewer` subagent against held-out fixtures.

### M3 — Commands (slash + @mention)

Two parallel interfaces, same permission model, same handler layer:

**Slash commands** — deterministic, no agent token cost for parsing:
- [ ] Comment parser: detect `/maintainer <cmd> [args]` at start of comment
- [ ] `/maintainer triage` — re-run triage with fresh context
- [ ] `/maintainer fix` — force a fix attempt (jumps to M4 flow)
- [ ] `/maintainer skip` — apply `maintainer:skip` label, no further automation on this issue
- [ ] `/maintainer explain` — agent rewrites issue in plain language as a comment
- [ ] `/maintainer dedupe` — re-run dup search and post links

**@mention with free-text instruction** — natural language, agent interprets intent:
- [ ] Detect `@maintainer` token (word-boundary, case-insensitive) anywhere in:
  - new issue body on `issues.opened` / `issues.edited`
  - any issue comment on `issue_comment.created`
  - any PR comment on `issue_comment.created` (PRs are issues to GitHub)
- [ ] Extract the surrounding instruction text (full comment body, since users write naturally)
- [ ] Pass to **intent-interpreting agent** (Sonnet) with full context:
  - issue title, body, labels, current state
  - last N comments
  - linked PRs / referenced issues
  - the user's instruction text
  - the same tool set as autonomous flows (read files, search, comment, label, draft PR, close, reopen, mark duplicate, ask reporter for info)
- [ ] Agent decides what to do; no hardcoded command list
- [ ] Works on **any issue, including pre-existing ones** — this is the explicit-trigger path for issues that pre-date Maintainer's install

**Shared infrastructure:**
- [ ] Permission gate: author must have write access to the repo. Non-collaborator commands ignored silently with single audit log line. Applies to both slash and mention paths.
- [ ] Reaction-based status signaling on the originating comment: eyes (received) → rocket (working) → check (done) / x (failed)
- [ ] Lock against re-entry: if Maintainer is already working on the same issue, queue or coalesce instead of running parallel jobs
- [ ] If both `/maintainer cmd` and `@maintainer ...` appear in one comment, slash command wins (deterministic path)
- [ ] Maintainer must never reply to or react to its own comments (loop prevention — check `sender.login` or bot identity)

**Acceptance:**
- Each slash command works against a fixture issue.
- For mention path: run a 15-prompt eval set covering common phrasings (triage requests, fix requests, dedup, polite-decline, info-request, reopen, close-as-not-planned). ≥80% take the correct action vs. human-graded ground truth.
- Non-collaborator commands and mentions are silently ignored.
- No infinite loops possible: bot ignores its own mentions/comments by sender check.
- Pre-existing issues respond correctly to `@maintainer triage this` and similar.

### M4 — Fix agent + draft PR
- [ ] Triggered when triage flags `scope: scoped` + `reproducible: true`, or via `/maintainer fix`
- [ ] Checkout target repo into runner workspace (`actions/checkout` equivalent or git CLI)
- [ ] Detect language + test command from `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile` (extensible)
- [ ] Install deps via project's own scripts
- [ ] Agent loop with file read/write/search/exec tools, scoped to workspace
- [ ] Run detected test command after edits; record output
- [ ] If tests pass: create branch `maintainer/fix-{issue-number}`, commit with structured message, open **draft PR** linking the issue, attach reasoning summary + diff stats + test output, apply `maintainer:needs-human-review`
- [ ] If tests fail or agent gives up: post a comment on the issue describing what was tried and why it stopped, no PR
- [ ] Hard timeout (configurable, default 20 min)
- [ ] Token budget cap (configurable)

**Acceptance:** Run against 5 known-fixable issues from the user's repos (selected manually). At least 3 of 5 produce a passing-test draft PR that the user judges as "I'd actually merge this with minor edits." Failure cases produce a useful diagnostic comment, not silence. No PR ever opens as ready-for-review.

### M5 — Schedule jobs
- [ ] Stale issue sweep on cron: comment after N days of inactivity, close after M more days, configurable
- [ ] Skip if any human comment within window
- [ ] Weekly stats collection (per-repo) → JSON artifact

**Acceptance:** Cron triggers in test repo run as expected. Stale rules respect config. No issues closed without warning comment.

### M6 — Dashboard / control-repo mode
- [ ] `mode: dashboard` input in workflow
- [ ] Reads list of target repos from `.github/maintainer.yml` in the control repo
- [ ] Aggregates via GitHub API: open / closed / stale counts, mean time-to-triage, mean time-to-fix, agent-PR acceptance rate, top 5 issues to focus on
- [ ] Writes `STATUS.md` to the control repo (commit on changes)
- [ ] Opens or updates a "Weekly Briefing" issue with highlights
- [ ] Works for any user, not just the original maintainer (no hardcoded repo names)

**Acceptance:** Run in user's `Maintainer` repo configured to aggregate his 10 OSS repos. Generated STATUS.md is accurate vs. ground truth checked manually against GitHub UI. Weekly Briefing issue is readable and actionable.

### M7 — Marketplace prep
- [ ] Polish README: hero quickstart, full config reference, command reference, FAQ, screenshots, security notes
- [ ] `action.yml` branding finalized
- [ ] Tag `v1.0.0`, with major-version moving tag `v1`
- [ ] Submit to GitHub Marketplace
- [ ] Public launch repo issues template + contributing guide

**Acceptance:** Marketplace listing live, install instructions copy-paste-work in a fresh repo, at least one external user can install without help.

### M8 — Bootstrap helper (v1.5, post-launch)
- [ ] `gh` extension `gh maintainer init` writes workflow, sets secret, creates labels
- [ ] `gh maintainer setup --org <org>` loops over org repos for bulk install

**Acceptance:** Full install on a new repo in under 30 seconds via one command.

## Completion / outcome conventions (apply to every flow)

These shape how trustworthy Maintainer feels and must be honored across triage, fix, slash, and mention paths.

**Universal rules:**
- [ ] Reactions on the trigger signal status: `eyes` (received) → `rocket` (working) → `check` (done) / `x` (failed). Reactions are transient UX, not the audit trail.
- [ ] Every run ends with a written outcome (comment, PR, or both). Never silent.
- [ ] One sticky comment per issue per flow type, marked with HTML comment `<!-- maintainer:state -->` and edited in place across re-runs. No duplicate-comment piling.
- [ ] Maintainer never closes issues on its own initiative. Closing only on explicit instruction (`/maintainer close`, `@maintainer close as ...`) or via PR merge auto-close (`Fixes #N` in PR body).
- [ ] Always link work product: PR number, related issues, files touched, test command output reference.
- [ ] PRs always open as **draft** and stay that way. No auto-ready-for-review, no auto-merge.
- [ ] Sticky comment footer always includes: timestamp, model, token count, runtime. Builds long-term cost-trust record.

**Per-outcome behavior:**
- [ ] **Triage done, no fix planned:** sticky comment with classification, severity, scope, dedup links, repro status, suggested next step. Labels applied. Issue stays open.
- [ ] **Fix succeeded:** draft PR opens with `Fixes #N` so merge auto-closes the issue. Sticky comment on issue: "Draft fix proposed in #PR. Tests passed. Awaiting review." Label `maintainer:fix-proposed`. Issue stays open.
- [ ] **Fix attempted, failed:** sticky comment with what was tried, what blocked the agent, suggested next steps, files inspected. Label `maintainer:fix-failed`. Issue stays open. No PR.
- [ ] **@mention task done:** final comment summarizing the action with links. Reactions complete. No closing unless explicitly instructed.
- [ ] **Out of scope / cannot do:** polite comment explaining why, no destructive action. Label `maintainer:needs-human`.
- [ ] **Duplicate detected (high confidence):** comment linking original, label `maintainer:duplicate`. **Do not auto-close.** Wait for human or explicit `/maintainer close-duplicate` instruction.

**Sticky comment template (proposed):**
```
<!-- maintainer:state -->
### Maintainer triage

- Type: <bug|feature|question|support|spam>
- Severity: <critical|high|medium|low>
- Scope: <scoped|multi-file|architectural|not-actionable>
- Reproducible: <yes|no|partial>
- Possible duplicates: <links or "none">
- Repro check: <summary>

Proposed action: <next step in plain language>

---
Run: <ISO timestamp> | model: <id> | tokens: <count> | runtime: <s>
```

## Cross-cutting acceptance criteria (apply to every milestone)

- [ ] No emojis in any source file, comment, prompt, PR body, or commit message (per user preference)
- [ ] No mention of "Claude" or "AI" in PR descriptions or issue comments authored by the agent — they read as the bot's own voice
- [ ] All agent outputs structured + concise, no marketing-speak
- [ ] Every agent prompt is in `prompts/` as a separate file, versioned, not inlined
- [ ] Every external call (Octokit, Anthropic) wrapped with retry + structured error logging
- [ ] No secrets ever logged
- [ ] Tests use recorded fixtures, no live API calls in CI
- [ ] Multi-tenant from day one: no hardcoded org/repo names anywhere

## Open questions to resolve before/during M1

1. **Action vs. composite vs. reusable workflow.** Default plan: JS Action (single bundled entrypoint, fastest cold start). Confirm before M0 builds the manifest.
2. **Claude Agent SDK vs. raw Anthropic SDK.** Agent SDK gives us tool-loop scaffolding for free but adds dependency surface. Raw SDK is more flexible. Recommend Agent SDK unless we hit a limitation.
3. **Repo checkout for fix flow.** Use `actions/checkout` as a separate step in the user's workflow, or have the Action shell out to `git clone` itself? First is more idiomatic, second is one-step UX. Recommend the Action does the clone — keeps the user's workflow file at 15 lines.
4. **Anthropic API key placement.** Repo secret vs. org secret guidance. Docs should push org-level for users with 2+ repos.
5. **Cost-control surface.** Per-issue token budget? Per-month spend cap visible in `STATUS.md`? Critical for trust at scale; recommend both.

## Non-goals for v1

- Auto-merging PRs
- Cross-repo refactors
- Architectural-change PRs
- Performance-tuning PRs (vague target)
- Hosted backend / web dashboard
- Web UI of any kind
- Slack/Discord/email integrations beyond GitHub-native notifications
- Anything billable or monetized

## Review

### M0 [DONE] — Scaffolding
Action manifest, ncc bundler, CI + release workflows, ESLint config, vitest, README, all green and shippable.

### M1 [DONE] — Foundation
Config schema (zod) with full defaults, YAML loader, Octokit wrapper, label set + auto-create, issue helpers (get/list-comments/post/update/sticky-upsert/reactions/close/reopen/permission-check), search with token-based candidate dedup, PR helpers, Anthropic client, agent loop with tool routing + budget tracking, structured-output helper, retry, log, sticky-marker utilities, typed event payloads.

### M2 [DONE] — Triage
On `issues.opened/reopened/edited`: searches candidate duplicates, calls Sonnet with forced structured-output tool (`triage_verdict`), classifies type / severity / scope / reproducibility, identifies duplicates, applies labels (severity tier, type, needs-repro, duplicate, needs-human), upserts sticky comment with run footer.

### M3 [DONE] — Commands
Both interfaces share permission gate (write access) and reaction lifecycle.
- Slash: `/maintainer triage|fix|skip|explain|dedupe|help`.
- Mention: free-text `@maintainer ...` invokes intent agent (Sonnet) with tool set: post_comment, apply_labels, remove_label, close_issue, reopen_issue, request_fix, request_triage. Bot ignores its own comments. Slash beats mention when both present.

### M4 [DONE] — Fix
Workspace sandbox with safe path resolution, allow-listed binary execution, file read/write/list/grep/run tools. Fix agent (Opus) with project detection (npm/pnpm/yarn/bun, pytest, cargo, go, ruby, mvn, gradle), test execution, branch + commit + push, draft PR creation with `Fixes #N`, `maintainer:needs-human-review` label. Failure modes (no changes, tests fail, push fail) each produce a useful sticky comment, never silence.

### M5 [DONE] — Schedule
Stale sweep with configurable inactivity windows, exempt labels, two-stage warn-then-close behavior. Weekly digest stub.

### M6 [DONE] — Dashboard
Control-repo aggregation across configured repos. Pulls per-repo KPIs (open, opened-this-week, closed-this-week, stale, fix-proposed, agent PR open/merged), top issues by reaction count. Renders `STATUS.md`, commits if changed, opens or updates a "Weekly Maintainer briefing" issue.

### M7 [DONE] — Marketplace prep
README with quickstart, command reference, full config reference, dashboard recipe, permissions and cost notes. CONTRIBUTING with architecture map. CHANGELOG. LICENSE (MIT). Sample `examples/maintainer.yml`.

### Final verification
- `npm run all`: green (typecheck, lint, 24/24 tests, ncc build).
- `dist/index.js`: 2.1MB bundle.
- Smoke test against bundle with mocked Action env: routes correctly, masks secrets, exits cleanly.

### Lines of code (excluding bundle, deps, dist)
- src/: ~2,500 lines across 29 files.
- test/: ~210 lines, 24 tests across 6 files.

### Deviations from plan
- Fix flow uses `actions/checkout@v4` from the user's workflow rather than cloning itself. README updated to reflect this; cost is one extra line in the user's workflow file but it's the standard idiomatic Actions pattern.
- Triage uses raw Anthropic SDK with structured-output tool-forcing; fix flow uses raw SDK with custom agent loop. Skipped Claude Agent SDK dependency in favor of a small (~140 LoC) in-house loop for tighter control over budget tracking and stop conditions.
- Prompts are inline TS string constants in `src/agent/prompts.ts` rather than separate `prompts/*.md` files — bundles cleanly with ncc. Easy to refactor later.

### Open follow-ups for v1.1+
- M8: `gh` extension for one-command bootstrap.
- Cross-PR-comment triggering (currently `issue_comment` covers PRs as issues, but `pull_request_review_comment` is not handled).
- Fix-flow: "agent PR feedback loop" — when reviewer leaves comments on the draft PR, agent revises.
- Cross-repo reads in dashboard mode currently silent-fail on private repos with no PAT; should warn explicitly.
- Per-issue idempotency lock (currently relies on GitHub Actions concurrency, which is per-workflow not per-issue).

