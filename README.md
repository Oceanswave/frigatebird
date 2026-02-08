# frigatebird

A Playwright-based CLI for X/Twitter, inspired by the `bird` CLI but using browser automation instead of GraphQL APIs.

## Architecture

- **Playwright** for browser automation
- **@steipete/sweet-cookie** for Chrome cookie extraction (authentication)
- **Commander** for CLI interface

## Installation

```bash
npm install
```

## Authentication

Frigatebird reuses your Chrome session cookies for authentication. Simply log in to X/Twitter in Chrome, and frigatebird will extract the auth cookies automatically.

## Commands

### whoami
Get logged-in user info:
```bash
npx tsx src/cli.ts whoami
```

### read
Read a single tweet:
```bash
npx tsx src/cli.ts read <tweet-url-or-id>
```

### search
Search tweets:
```bash
npx tsx src/cli.ts search "query"
```

### list-timeline
Read a list's timeline:
```bash
npx tsx src/cli.ts list-timeline <list-id>
```

### post
Post a tweet:
```bash
npx tsx src/cli.ts post "text"
```

## Project Structure

```
src/
├── cli.ts       # CLI entry point with Commander
├── browser.ts   # Playwright session management + sweet-cookie auth
└── commands.ts  # Command implementations
```

## Build

```bash
npm run build
```

## Development

Run in dev mode (without compiling):
```bash
npx tsx src/cli.ts <command>
```

## Credits

- Pattern based on [x-list-manager](https://github.com/Oceanswave/x-list-manager)
- Cookie extraction via [@steipete/sweet-cookie](https://github.com/steipete/sweet-cookie)
