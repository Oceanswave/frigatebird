# frigatebird 🐦 — resilient X CLI for posting, articles, replies, reading, and list automation

<div style="text-align: center;">
  <img src="images/frigatebird_logo.jpg" alt="Frigatebird logo" />
</div>


`frigatebird` is a Playwright-first X CLI that preserves the familiar `bird` command-line experience while running on browser automation instead of private GraphQL internals.

## Why This Exists

`bird` set a high bar for fast, scriptable X workflows. After deprecation and de-open-sourcing, teams still needed the same CLI ergonomics without depending on internal API behavior.

`frigatebird` is the continuity path:
- Keep the `bird`-style command surface.
- Keep API-key-free operation via browser session cookies.
- Keep practical day-to-day workflows for posting, reading, follows, lists, and timeline operations.

## Disclaimer

Frigatebird automates X’s web UI and relies on selectors/flows that X can change at any time. Expect occasional breakage when X ships UI changes.

## Install

```bash
npm install
npx playwright install chromium
```

When published to npm:

```bash
npm install -g frigatebird
```

## Quickstart

```bash
# Show authenticated account
frigatebird whoami

# Read a tweet (URL or ID)
frigatebird read https://x.com/user/status/1234567890123456789
frigatebird 1234567890123456789 --json

# Post and reply
frigatebird tweet "hello from frigatebird"
frigatebird reply 1234567890123456789 "thanks"

# Publish a long-form article
frigatebird article "Launch notes" "Today we shipped..."
frigatebird article "Draft from file" --body-file ./article.md

# Search and mentions
frigatebird search "from:openai" -n 5
frigatebird mentions -n 5

# Lists and list timeline
frigatebird lists --json
frigatebird list-timeline 1234567890 -n 20

# Follow graph
frigatebird following -n 20 --json
frigatebird followers -n 20 --json

# List membership automation
frigatebird add "AI News" @openai @anthropicai
frigatebird remove @openai "AI News"
frigatebird batch accounts.json
```

## Commands

- `frigatebird tweet "<text>"` — post a tweet.
- `frigatebird post "<text>"` — alias for `tweet`.
- `frigatebird article "<title>" [body] [--body-file path]` — publish a long-form article.
- `frigatebird reply <tweet-id-or-url> "<text>"` — reply to a tweet.
- `frigatebird read <tweet-id-or-url> [--json] [--json-full]` — read one tweet.
- `frigatebird <tweet-id-or-url> [--json]` — shorthand for `read`.
- `frigatebird replies <tweet-id-or-url> [--all] [--max-pages n] [--cursor str] [--delay ms] [-n count] [--json] [--json-full]` — list replies.
- `frigatebird thread <tweet-id-or-url> [--all] [--max-pages n] [--cursor str] [--delay ms] [-n count] [--json] [--json-full]` — show thread/conversation tweets.
- `frigatebird search "<query>" [-n count] [--all] [--max-pages n] [--cursor str] [--delay ms] [--json] [--json-full]` — search tweets.
- `frigatebird mentions [--user @handle] [-n count] [--json] [--json-full]` — mention timeline/search.
- `frigatebird user-tweets <@handle> [-n count] [--all] [--max-pages n] [--cursor str] [--delay ms] [--json] [--json-full]` — profile tweets.
- `frigatebird home [-n count] [--following] [--all] [--max-pages n] [--delay ms] [--json] [--json-full]` — home timeline.
- `frigatebird bookmarks [-n count] [--folder-id id] [--all] [--max-pages n] [--cursor str] [--expand-root-only] [--author-chain] [--author-only] [--full-chain-only] [--include-ancestor-branches] [--include-parent] [--thread-meta] [--sort-chronological] [--delay ms] [--json] [--json-full]` — bookmarks + optional thread expansion.
- `frigatebird unbookmark <tweet-id-or-url...> [--json]` — remove bookmark(s).
- `frigatebird like <tweet-id-or-url>` — like a tweet.
- `frigatebird retweet <tweet-id-or-url>` — repost a tweet.
- `frigatebird likes [-n count] [--all] [--max-pages n] [--cursor str] [--delay ms] [--json] [--json-full]` — liked tweets.
- `frigatebird follow <username-or-id>` — follow user.
- `frigatebird unfollow <username-or-id>` — unfollow user.
- `frigatebird following [--user userId] [-n count] [--all] [--max-pages n] [--cursor str] [--delay ms] [--json] [--json-full]` — accounts a user follows.
- `frigatebird followers [--user userId] [-n count] [--all] [--max-pages n] [--cursor str] [--delay ms] [--json] [--json-full]` — accounts following a user.
- `frigatebird lists [--member-of] [-n count] [--json] [--json-full]` — list your lists.
- `frigatebird list [--member-of] [-n count] [--json] [--json-full]` — alias for `lists`.
- `frigatebird list-timeline <list-id-or-url> [-n count] [--all] [--max-pages n] [--cursor str] [--delay ms] [--json] [--json-full]` — timeline for a list.
- `frigatebird news [-n count] [--ai-only] [--with-tweets] [--tweets-per-item n] [--for-you] [--news-only] [--sports] [--entertainment] [--trending-only] [--json] [--json-full]` — explore/news aggregation.
- `frigatebird trending` — alias for `news`.
- `frigatebird about <@handle> [--json]` — profile origin/location metadata.
- `frigatebird query-ids [--fresh] [--json]` — compatibility command (Playwright mode does not require GraphQL query IDs).
- `frigatebird whoami [--json]` — active authenticated account.
- `frigatebird check` — credential/session status.
- `frigatebird refresh [--json]` — refresh local auth cookie cache.
- `frigatebird add <listName> <handles...> [--no-headless] [--json]` — add handles to list.
- `frigatebird remove <handle> <listName> [--no-headless] [--json]` — remove handle from list.
- `frigatebird batch <file.json> [--no-headless] [--json]` — batch list updates from JSON.
- `frigatebird help [command]` — command help.

## Global Options

- `--auth-token <token>`
- `--ct0 <token>`
- `--base-url <url>` (default `https://x.com`, useful for fixture/e2e)
- `--cookie-source <chrome|firefox|safari|edge>` (repeatable)
- `--chrome-profile <name>`
- `--chrome-profile-dir <path>`
- `--firefox-profile <name>`
- `--cookie-timeout <ms>`
- `--timeout <ms>`
- `--quote-depth <n>`
- `--media <path>` (repeatable)
- `--alt <text>` (repeatable)
- `--plain`
- `--no-emoji`
- `--no-color`
- `--no-headless`

Media rules:
- up to 4 attachments
- one video maximum
- video cannot be mixed with other media
- supported: `jpg`, `jpeg`, `png`, `webp`, `gif`, `mp4`, `m4v`, `mov`

## Authentication

Frigatebird uses your existing X web session and cookie credentials. No X API key required.

Resolution order:
1. CLI flags (`--auth-token`, `--ct0`)
2. env vars (`AUTH_TOKEN`, `CT0`, fallbacks below)
3. browser cookie extraction via `@steipete/sweet-cookie`

When `--cookie-source` is explicitly set and differs from cached auth source metadata, Frigatebird clears cached auth and re-resolves cookies from the requested source order.

If auth fails:
```bash
frigatebird refresh
frigatebird check
frigatebird whoami
```

## Config (JSON5)

Precedence: **CLI flags > env vars > project config > global config**.

Config files:
- `~/.config/bird/config.json5`
- `~/.config/frigatebird/config.json5`
- `./.birdrc.json5`
- `./.frigatebirdrc.json5`

Supported keys:
- `authToken`, `ct0`, `baseUrl`
- `cookieSource`
- `chromeProfile`, `chromeProfileDir`, `firefoxProfile`
- `cookieTimeoutMs`, `timeoutMs`, `quoteDepth`

Example:

```json5
{
  cookieSource: ["chrome", "safari"],
  chromeProfile: "Default",
  timeoutMs: 20000,
  quoteDepth: 1
}
```

Environment vars:
- auth: `AUTH_TOKEN`, `CT0`, `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`
- cookie source: `BIRD_COOKIE_SOURCE`, `FRIGATEBIRD_COOKIE_SOURCE`
- base URL: `BIRD_BASE_URL`, `FRIGATEBIRD_BASE_URL`
- profiles: `BIRD_CHROME_PROFILE`, `BIRD_CHROME_PROFILE_DIR`, `BIRD_FIREFOX_PROFILE` and `FRIGATEBIRD_*` variants
- timeouts/depth: `BIRD_TIMEOUT_MS`, `BIRD_COOKIE_TIMEOUT_MS`, `BIRD_QUOTE_DEPTH` and `FRIGATEBIRD_*` variants
- output: `NO_COLOR`, `BIRD_PLAIN`, `FRIGATEBIRD_PLAIN`

## Output

- `--json` gives machine-readable output for read/timeline/list commands.
- `--json-full` includes raw compatibility payloads where available.
- `--plain` disables emoji + color for stable scripts.

## Development

```bash
npm install
npx playwright install chromium
npm run build
npm run lint
npm run test:run        # unit/integration
npm run test:coverage   # unit/integration + coverage
npm run test:e2e        # e2e only
npm run test:e2e:live -- --list-name testlist001   # opt-in live mutation e2e (article mutation disabled by default)
npm run smoke:pack-install
```

Live mutation e2e requirements:
- required argument: `--list-name <your-list-name>`
- `FRIGATEBIRD_AUTH_TOKEN`
- `FRIGATEBIRD_CT0`
- optional args: `--cookie-source <source>`
- optional env: `FRIGATEBIRD_LIVE_COOKIE_SOURCE`, `FRIGATEBIRD_LIVE_EXPECTED_HANDLE_PREFIX`, `FRIGATEBIRD_LIVE_TARGET_HANDLE`
- article mutation is disabled by default; enable manually with:
  - `--enable-premium-features-e2e --article-cookie-source chrome --article-expected-handle-prefix Oceanswave`

## Release

- CI: `.github/workflows/ci.yml`
- npm publish: `.github/workflows/release.yml` (triggered by GitHub Release `published`, trusted publishing/OIDC)
- live mutation CI: `.github/workflows/live-e2e.yml` (manual trigger; accepts `list_name` workflow input + validates auth secrets before running)
- PR auto-merge: `.github/workflows/auto-merge.yml` (uses `pull_request_target`; enables squash auto-merge for non-draft same-repo PRs)
- release checklist: `RELEASE.md`

## Notes

- Selector drift is the primary maintenance cost.
- `query-ids` is intentionally kept for CLI compatibility with historical `bird` workflows.
