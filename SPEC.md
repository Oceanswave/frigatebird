# Frigatebird Technical Specification

## Overview

Frigatebird is a TypeScript CLI for interacting with X via browser automation. It targets command-level parity with `bird` and includes list-management capabilities from `x-list-manager`.

## Product Intent

- Preserve the user-facing `bird` command model after `bird` deprecation.
- Replace unstable/private GraphQL dependency with Playwright-driven web interactions.
- Consolidate read, mutation, and list-management operations into one CLI.

## Architecture

### 1. CLI Assembly (`src/cli/`, `src/cli.ts`)
- Declares the command surface with Commander.
- Normalizes shorthand invocation (`<tweet-id-or-url>` -> `read`).
- Resolves option precedence: CLI > env > project config > global config.

### 2. Command Handlers (`src/commands/handlers.ts`)
- Maps CLI actions to client operations.
- Applies option parsing per command category.
- Normalizes JSON/plain output behavior.

### 3. Client Layer (`src/client/`)
- `FrigatebirdClient` interface defines all command capabilities.
- `PlaywrightXClient` implements behavior through X web navigation and DOM scraping.

### 4. Browser Layer (`src/browser/`)
- Session lifecycle and login checks.
- Cookie loading and auth store management.
- Scraping collectors for tweets, users, lists, and news.

### 5. Shared Library (`src/lib/`)
- Identifier parsing (`tweet`, `list`, `profile` references).
- Option parsing and normalization.
- Output formatting and rendering.
- Config/env loading and merge precedence.

## Compatibility Model

### bird parity
- Frigatebird implements the `bird` CLI command/flag interface to maximize drop-in usability.
- GraphQL-only internals are represented as compatibility behavior where needed.

### x-list-manager parity
- Frigatebird embeds list automation commands (`add`, `remove`, `batch`, `refresh`) with equivalent UX expectations.

## Testing Strategy

- Unit tests cover parsing, invocation, handler orchestration, and client helper behavior.
- End-to-end tests run real browser flows against fixture pages for read-only scenarios and empty accounts.
- Release gate requires lint + build + full test + coverage.

## Operational Constraints

- X DOM/selectors can change without notice.
- Auth depends on valid browser session cookies or explicit token input.
- Read-only fixture e2e validates resilient behavior under low/no timeline data.
