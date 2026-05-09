# Maintainer

Automatic maintenance for your GitHub repositories. Triages every new issue, deduplicates against existing ones, and drafts pull requests for scoped, reproducible bugs. One workflow file, no backend, runs entirely inside GitHub Actions.

## What it does

- **Triages new issues automatically** — classifies type, scores severity, finds duplicates, checks for missing repro steps, applies labels, posts a structured summary comment.
- **Drafts fix pull requests** — for scoped, reproducible bugs, it reads the codebase, makes a minimal change, runs your tests, and opens a draft PR linked to the issue.
- **Responds to commands** — `/maintainer fix`, `/maintainer triage`, `/maintainer skip`, plus free-form `@maintainer` mentions: "@maintainer this is a duplicate of #142, mark it".
- **Closes stale issues politely** — configurable inactivity policy with warning comment before close.
- **Aggregates a weekly briefing** — when installed in a control repo, generates `STATUS.md` with cross-repo KPIs and the issues that matter most this week.

## Quickstart

### 1. Set the API key

Add `ANTHROPIC_API_KEY` as an organization secret (recommended for multiple repos) or repository secret in **Settings → Secrets and variables → Actions**.

### 2. Add the workflow

Create `.github/workflows/maintainer.yml` in the repository you want maintained:

```yaml
name: Maintainer

on:
  issues:
    types: [opened, reopened, edited]
  issue_comment:
    types: [created]
  schedule:
    - cron: '0 9 * * 1'  # weekly stale sweep + digest

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  maintain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ugurkoc/maintainer@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 3. Commit

The first run creates the standard label set (`maintainer:bug`, `maintainer:needs-repro`, etc.) and confirms the install. Open a new issue and watch the triage comment appear within a minute.

## Commands

Comments by users with write access to the repository can invoke Maintainer:

| Command | Effect |
| --- | --- |
| `/maintainer triage` | Re-run triage on this issue |
| `/maintainer fix` | Attempt a fix and open a draft pull request |
| `/maintainer explain` | Rewrite the issue in plain language |
| `/maintainer dedupe` | Re-search for duplicates |
| `/maintainer skip` | Disable automation for this issue |
| `/maintainer help` | Show the command list |

You can also write `@maintainer <natural language instruction>` for free-form requests:

- `@maintainer this is a duplicate of #142, mark it`
- `@maintainer the OP didn't include logs, ask them politely for a stack trace`
- `@maintainer reproduce this against the v2 branch and fix if you can`
- `@maintainer this isn't actionable, leave a kind comment`

The agent reads the issue context plus your instruction and chooses the right action.

## Configuration

All configuration is optional. Drop a `.github/maintainer.yml` in the target repository to override defaults:

```yaml
triage:
  enabled: true
  model: claude-sonnet-4-6
  auto_label: true
  auto_dedupe: true

fix:
  enabled: true
  model: claude-opus-4-7
  auto_attempt: true            # auto-fix scoped reproducible bugs
  timeout_minutes: 20
  max_input_tokens: 500000
  max_output_tokens: 50000
  max_steps: 40
  test_command: "npm test"      # override auto-detection

commands:
  enabled: true
  require_write_permission: true
  intent_model: claude-sonnet-4-6

stale:
  enabled: true
  days_until_stale: 60
  days_until_close: 14
  exempt_labels: [pinned, security]

dashboard:
  enabled: false                # set true on the control repo only
  repos:
    - your-org/repo-1
    - your-org/repo-2
  output_path: STATUS.md
  open_briefing_issue: true

labels:
  prefix: "maintainer:"

skip_label: "maintainer:skip"
```

## Outcome conventions

- **Reactions on triggers** signal status: eyes (received), rocket (working), check (done).
- **Sticky comments** — Maintainer maintains one comment per flow per issue and edits it in place. No noise.
- **Draft PRs only** — every fix PR opens as a draft labeled `maintainer:needs-human-review`. Maintainer never marks a PR ready or merges.
- **Never auto-closes issues** — only on explicit instruction or via `Fixes #N` PR merge.
- **Run footer in every comment** — timestamp, model, token count, runtime. Trust through transparency.

## Cross-repo dashboard

To get a single pane of glass across your repositories, dedicate one repo as a control repo and add this workflow:

```yaml
name: Maintainer dashboard

on:
  schedule:
    - cron: '0 9 * * 1'
  workflow_dispatch:

permissions:
  contents: write
  issues: write

jobs:
  dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ugurkoc/maintainer@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: dashboard
```

Configure the list of repos to track in `.github/maintainer.yml`:

```yaml
dashboard:
  enabled: true
  repos:
    - your-org/repo-1
    - your-org/repo-2
    - your-org/repo-3
```

A `STATUS.md` is committed and a "Weekly Maintainer briefing" issue is opened or updated.

## Permissions

The workflow needs:

- `contents: write` — to push fix branches
- `issues: write` — to comment, label, and react
- `pull-requests: write` — to open draft PRs

The `GITHUB_TOKEN` provided by Actions is sufficient. No PAT required for single-repo use. Cross-repo dashboard reads work with `GITHUB_TOKEN` for public repos; private repos require a PAT or App token with `repo` read scope.

## Cost

Maintainer uses your Anthropic API key. Per-issue cost depends on issue length and fix complexity:

- Triage: ~5–15k input tokens, ~500 output tokens. Pennies per issue.
- Fix attempts: ~50k–500k input tokens, ~5k–50k output tokens. Bounded by `max_input_tokens` and `max_output_tokens` in config.

Set lower limits in `.github/maintainer.yml` to cap spend.

## Status

Pre-release. v1 milestones are tracked in [tasks/todo.md](tasks/todo.md). Issues and PRs welcome.

## License

MIT
