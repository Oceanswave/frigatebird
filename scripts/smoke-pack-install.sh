#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_ROOT="$(mktemp -d /tmp/frigatebird-smoke-XXXXXX)"
PACK_DIR="$SMOKE_ROOT/pack"
APP_DIR="$SMOKE_ROOT/app"

mkdir -p "$PACK_DIR" "$APP_DIR"

TARBALL="$(cd "$ROOT_DIR" && npm pack --pack-destination "$PACK_DIR" --silent)"

cd "$APP_DIR"
npm init -y >/dev/null 2>&1
npm install "$PACK_DIR/$TARBALL" >/dev/null 2>&1

echo "Smoke root: $SMOKE_ROOT"
echo "Tarball: $TARBALL"
echo

echo "== frigatebird --help (head) =="
npx frigatebird --help | head -n 10

echo
echo "== frigatebird query-ids --json =="
npx frigatebird query-ids --json
