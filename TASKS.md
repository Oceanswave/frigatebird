# Frigatebird Parity and Release Tasks

## Parity
- [x] Match `bird` command surface from a CLI interface standpoint.
- [x] Keep shorthand tweet read invocation compatibility.
- [x] Implement pagination and JSON flags across read commands.
- [x] Support bird-style config/env precedence and key mappings.
- [x] Keep compatibility behavior for `query-ids` and bookmark expansion flags.

## x-list-manager Integration
- [x] Include `refresh`, `add`, `remove`, and `batch` commands.
- [x] Preserve headless/headed toggle behavior with `--no-headless`.
- [x] Keep result reporting compatible for automation use.

## Architecture
- [x] Split monolithic implementation into modular layers (`cli`, `commands`, `client`, `browser`, `lib`).
- [x] Define typed client interface for clear command contracts.
- [x] Centralize option parsing and output formatting.

## Testing
- [x] Add/expand unit tests for CLI entry, invocation normalization, options, handlers, and client helpers.
- [x] Add read-only end-to-end coverage for empty-account conditions.
- [x] Ensure lint/build/test/coverage all pass before release.

## Release Preparation
- [x] Add `CHANGELOG.md`.
- [x] Add `RELEASE.md` release checklist and publish flow.
- [x] Add `SKILL.md` + `SPEC.md` + `TASKS.md` for agent-oriented usage.
- [x] Add mutation-focused e2e coverage against disposable test accounts, including list add/remove/batch checks.
