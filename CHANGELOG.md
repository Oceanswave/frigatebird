# Changelog

## 0.3.1 - 2026-02-09

### Added
- Premium-feature live e2e opt-in flag: `--enable-premium-features-e2e`.
- Live e2e support for dedicated premium account cookies via `--article-cookie-source`.
- Coverage thresholds in `vitest.config.ts` to enforce release quality gates.

### Changed
- Live mutation CI now accepts `workflow_dispatch` input `list_name` instead of a repository variable.
- Premium feature mutation coverage (article publish path) is disabled by default and only runs when explicitly enabled.
- Article publish automation was updated for current X compose flows (`/compose/articles`, `Write`, and modern composer/title selectors).
- Live e2e naming now reflects premium-feature scope instead of article-specific semantics.

### Tests
- Added/updated Playwright client tests for modern article composer fallback behavior.
- Verified full release gate (`lint`, `build`, `coverage`) and fixture e2e pass on 0.3.1 candidate.

## 0.3.0 - 2026-02-09

### Added
- Long-form article publishing command: `article <title> [body] [--body-file <path>]`.
- Dedicated live mutation CI workflow: `.github/workflows/live-e2e.yml`.
- Browser session identity hardening with multi-selector `whoami` fallback coverage.
- Additional Playwright client method tests for retweet and mutation resilience.

### Changed
- Mutation `retweet` flow now uses bounded resilient click handling and explicit completion checks.
- Read-only fixture e2e was optimized to run significantly faster while preserving command coverage.
- CI and release verification workflows now include fixture e2e smoke runs.
- Live mutation e2e now requires a `--list-name` argument and always validates list `add/remove/batch` paths.

### Tests
- Expanded unit coverage for session identity parsing and retweet mutation branches.
- Verified end-to-end live mutation flow (tweet/reply/like/retweet/follow/list mutations) with Safari cookie source.

## 0.2.0 - 2026-02-08

### Added
- Modular architecture split across `cli`, `commands`, `client`, `browser`, and `lib` domains.
- Expanded bird-compatible CLI surface including timeline/search/news/lists/follows/likes/bookmarks/about/query commands.
- Integrated `x-list-manager` workflows: `refresh`, `add`, `remove`, and `batch`.
- Config and environment precedence matching bird semantics.
- Media attachment validation parity (`--media`, `--alt`, max counts, video constraints).
- Deterministic read-only end-to-end tests using local fixture pages and `--base-url`.
- Project skill files: `SKILL.md`, `SPEC.md`, `TASKS.md`.

### Changed
- Runtime engine standardized on Playwright browser automation instead of GraphQL internals.
- `query-ids` retained as a compatibility command in Playwright mode.
- Documentation now explicitly describes Frigatebird intent and contrast with bird.

### Tests
- Added broad unit coverage across option parsing, invocation normalization, handlers, and Playwright client behavior.
- Added read-only empty-account e2e coverage for command stability in low-data scenarios.
