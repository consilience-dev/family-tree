#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# This local preview used a temporary official Node runtime because this Mac had no Node on PATH.
if ! command -v node >/dev/null 2>&1; then
  task_runtime=/private/tmp/family-tree-runtime/node-v22.23.5-darwin-arm64/bin
  if [ -x "$task_runtime/node" ]; then
    PATH="$task_runtime:$PATH"; export PATH
  else
    echo 'Install Node.js 22.12 or newer from https://nodejs.org, then run this script again.' >&2
    exit 1
  fi
fi
if [ ! -d node_modules ]; then npm ci; fi
exec npm run dev
