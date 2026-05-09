# Changelog

All notable changes to Maintainer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial scaffolding: TypeScript Action, ncc bundle, CI and release workflows.
- M1 — event routing, config schema and loader, GitHub helpers, Anthropic client, agent loop, structured-output helper.
- M2 — triage agent with classification, severity scoring, scope estimation, duplicate search, label application, sticky comment.
- M3 — slash commands (`triage`, `fix`, `skip`, `explain`, `dedupe`, `help`) and free-form `@maintainer` natural-language interface backed by the intent agent.
- M4 — fix agent with workspace sandbox, file and exec tools, project detection, draft PR creation with `Fixes #N` linkage.
- M5 — stale issue sweep with configurable warning and close windows; weekly digest stub.
- M6 — control-repo dashboard mode with cross-repo aggregation and `STATUS.md` generation.
- Outcome conventions: reactions for transient status, sticky comments per flow, run footer with cost/runtime.
- README with quickstart, full configuration reference, command list, and dashboard recipe.
- CONTRIBUTING with architecture overview and release process.

[Unreleased]: https://github.com/ugurkoc/maintainer/commits/main
