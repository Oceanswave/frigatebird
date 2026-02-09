---
name: frigatebird
description: Use Frigatebird to interact with X from the CLI with bird-compatible commands plus x-list-manager list automation. Use when users ask to read timelines/tweets, manage follows/lists, or automate list membership without X API keys.
argument-hint: 'whoami, read https://x.com/user/status/123, search "from:openai", add "AI News" @openai @anthropicai'
---

# Frigatebird Skill

Frigatebird is a Playwright-first CLI that preserves `bird` command ergonomics and includes `x-list-manager` list operations.

## Use This Skill When

- The user asks for `bird`-style CLI interactions on X.
- The user wants list automation (`add`, `remove`, `batch`, `refresh`).
- The user wants browser-cookie-based operation without API keys.

## Core Workflow

1. Verify auth/session health:
   - `npx tsx src/cli.ts check`
   - `npx tsx src/cli.ts whoami`
2. For read-only tasks, prefer JSON output:
   - `npx tsx src/cli.ts read <tweet-id-or-url> --json`
   - `npx tsx src/cli.ts search "<query>" --json`
3. For list-management tasks:
   - `npx tsx src/cli.ts add "<List Name>" @handle1 @handle2`
   - `npx tsx src/cli.ts remove @handle "<List Name>"`
   - `npx tsx src/cli.ts batch accounts.json`
4. Use pagination controls for large reads:
   - `--all`, `--max-pages`, `--cursor`, `-n`

## Command Groups

- Posting/mutations: `tweet`, `post`, `reply`, `like`, `retweet`, `follow`, `unfollow`, `unbookmark`
- Read/timelines: `read`, `replies`, `thread`, `search`, `mentions`, `user-tweets`, `home`, `bookmarks`, `likes`, `list-timeline`, `news`, `about`
- Identity/health: `check`, `whoami`, `query-ids`, `help`
- List automation: `refresh`, `add`, `remove`, `batch`, `lists`, `list`

## Options That Matter Most

- Auth/cookies: `--auth-token`, `--ct0`, `--cookie-source`, `--chrome-profile`, `--firefox-profile`
- Determinism/testing: `--base-url`, `--plain`, `--no-color`
- Pagination: `-n`, `--all`, `--max-pages`, `--cursor`, `--delay`
- Output: `--json`, `--json-full`
- Media posting: `--media`, `--alt`

## Caveats

- This tool depends on X web UI selectors; selector drift can break flows.
- `query-ids` is retained for command compatibility and does not drive Playwright execution.
- Some GraphQL-specific behavior from original `bird` is represented as compatibility flags in Playwright mode.
