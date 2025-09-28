#!/usr/bin/env bash
set -euo pipefail
if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed. Install with: brew install ngrok" >&2
  exit 1
fi
# Start an HTTPS tunnel to localhost:5000
ngrok http 5000
