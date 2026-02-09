# Frigatebird Release Guide

## Release Intent

Frigatebird is the continuity CLI for the deprecated `bird` project: it preserves the command UX while moving execution to a Playwright-driven engine and folding in `x-list-manager` list-management capabilities.

## Preflight

1. Ensure local tree only contains intentional changes.
2. Ensure npm trusted publishing is configured for package `frigatebird`:
   - npm package: `frigatebird`
   - provider: GitHub Actions
   - repository: `Oceanswave/frigatebird`
   - workflow: `.github/workflows/release.yml`
3. Install dependencies and browsers:
   - `npm install`
   - `npx playwright install chromium`
4. Run release gate:
   - `npm run release:check`
5. Run clean-install smoke:
   - `npm run smoke:pack-install`
6. Optional pre-release e2e run:
   - `npm run test:e2e`
7. Optional pre-release live mutation e2e:
   - required argument: `--list-name <your-list-name>`
   - optional args: `--cookie-source <source>`
   - required env: `FRIGATEBIRD_AUTH_TOKEN`, `FRIGATEBIRD_CT0`
   - command: `npm run test:e2e:live -- --list-name testlist001`
   - note: premium feature mutation (article) is disabled by default; opt-in only:
     - `npm run test:e2e:live -- --list-name testlist001 --enable-premium-features-e2e --article-cookie-source chrome --article-expected-handle-prefix Oceanswave`

## GitHub Workflows

- CI workflow: `/Users/oceanswave/Projects/frigatebird/.github/workflows/ci.yml`
  - Runs on `pull_request` and `push` to `main`.
  - Executes lint, build, unit/integration coverage tests, fixture e2e smoke, and package dry-run.
- Release workflow: `/Users/oceanswave/Projects/frigatebird/.github/workflows/release.yml`
  - Runs on GitHub Release `published` events.
  - Verifies tag/version/package name alignment, runs release gate + fixture e2e smoke, and publishes to npm via trusted publishing (OIDC).
- Live e2e workflow: `/Users/oceanswave/Projects/frigatebird/.github/workflows/live-e2e.yml`
  - Runs on `workflow_dispatch` and weekly `schedule`.
  - Manual dispatch inputs: `list_name`, `cookie_source`, `premium_features_e2e`, and article-related inputs.
  - Scheduled runs are opt-in only via repository variable `FRIGATEBIRD_ENABLE_SCHEDULED_LIVE_E2E=1`.
  - Scheduled config uses repo variables:
    - `FRIGATEBIRD_LIVE_E2E_LIST_NAME` (required)
    - `FRIGATEBIRD_LIVE_E2E_COOKIE_SOURCE`, `FRIGATEBIRD_LIVE_E2E_PREMIUM`
    - optional guard/article vars (`FRIGATEBIRD_LIVE_E2E_EXPECTED_HANDLE_PREFIX`, `FRIGATEBIRD_LIVE_E2E_ARTICLE_COOKIE_SOURCE`, `FRIGATEBIRD_LIVE_E2E_ARTICLE_EXPECTED_HANDLE_PREFIX`)
  - Requires secrets `FRIGATEBIRD_AUTH_TOKEN` + `FRIGATEBIRD_CT0`.
- Auto-merge workflow: `/Users/oceanswave/Projects/frigatebird/.github/workflows/auto-merge.yml`
  - Runs on `pull_request_target`.
  - Enables squash auto-merge for eligible non-draft PRs from branches in this repository.

## Packaging Checks

1. Build artifacts:
   - `npm run build`
2. Inspect package contents:
   - `npm pack --dry-run`
3. Verify expected files are included (`dist`, `README.md`, `CHANGELOG.md`, `LICENSE`, `SKILL.md`, `SPEC.md`, `TASKS.md`).

## Publish Steps

1. Bump version in `package.json`.
2. Update `CHANGELOG.md` with release notes.
3. Commit and tag:
   - `git add -A`
   - `git commit -m "release: vX.Y.Z"`
   - `git tag vX.Y.Z`
4. Push commit + tag:
   - `git push`
   - `git push --tags`
5. Publish a GitHub Release for `vX.Y.Z`:
   - `gh release create vX.Y.Z --generate-notes`
   - or publish the release in the GitHub UI

Publishing the GitHub Release triggers the npm publish workflow automatically.

## Post-Release Validation

1. Smoke test install in a clean directory.
2. Run:
   - `frigatebird --help`
   - `frigatebird check`
   - `frigatebird whoami`
3. Confirm README command examples still match CLI output.
