# Contributing

Thanks for considering a contribution to Maintainer.

## Local setup

```bash
git clone https://github.com/ugurkocde/Maintainer
cd maintainer
npm install
npm run all
```

`npm run all` runs typecheck, lint, tests, and the bundler. It is the same pipeline CI runs.

## Architecture

```
src/
  index.ts                 entrypoint, routes by GitHub event name
  config/                  zod schema for .github/maintainer.yml + loader
  github/                  Octokit wrappers (labels, issues, PRs, search, client)
  agent/                   Anthropic client, agent loop, structured-output helper, prompts
  triage/                  M2: classify, dedup, label, sticky comment
  commands/                M3: slash and @mention parsing, intent agent, explain
  fix/                     M4: workspace sandbox, file/exec tools, fix agent, PR creation
  schedule/                M5: stale sweep + weekly digest
  dashboard/               M6: cross-repo aggregation, STATUS.md renderer
  util/                    log, events, sticky markers, token budget, retry
prompts/                   reserved for prompt asset files (currently inline in agent/prompts.ts)
test/                      vitest tests
dist/                      ncc bundle, committed so the Action can run without an install step
.github/workflows/         CI + release workflows
```

## Bundle handling

The Action runs `dist/index.js` directly with no install step. Whenever you change `src/`, run `npm run build` and commit the regenerated `dist/`. CI fails if `dist/` is out of sync with source.

## Releasing

Tagging `vX.Y.Z` triggers `.github/workflows/release.yml` which:

1. Runs the full pipeline.
2. Verifies `dist/` matches source.
3. Force-updates the rolling major-version tag (e.g. `v1`).
4. Creates a GitHub release with auto-generated notes.

## Style

- TypeScript strict mode, ES2022, NodeNext modules.
- No emojis in source, prompts, comments authored by the agent, or PR bodies.
- The agent never references being an AI or names a specific model in user-facing text.
- Comment sparingly. Prefer self-documenting names.
- No backwards-compat shims. If something is unused, delete it.

## Testing the Action against a real repo

The fastest loop is to push a commit, tag a temporary version, then `uses: <your-fork>/maintainer@<tag>` in a sandbox repo. For most agent-behavior changes, prefer adding a vitest unit test against a fixture event payload.

## Reporting issues

If you find a bug, open an issue with:

- What you expected
- What happened
- Steps to reproduce
- Action run URL if applicable
