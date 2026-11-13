#!/usr/bin/env bash
set -euo pipefail
# Basic repo checks for Netlify edge project
test -f netlify.toml
test -f netlify/edge-functions/stream.ts
test -f netlify/edge-functions/health.ts
test -f public/radio.m3u
git diff --check
echo "check: OK"
