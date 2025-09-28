#!/usr/bin/env bash
set -euo pipefail

# Simple HTTPS tunnel via Cloudflare (TryCloudflare, no account required)
# This script auto-downloads cloudflared (no Homebrew) if it's not installed.

PORT=${1:-5000}

have_cf() { command -v cloudflared >/dev/null 2>&1; }

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/.bin"
CACHE_DIR="$SCRIPT_DIR/.cache"
mkdir -p "$BIN_DIR" "$CACHE_DIR"

CLOUDFLARED_BIN=""

if have_cf; then
  CLOUDFLARED_BIN="$(command -v cloudflared)"
else
  # Detect arch mapping for Cloudflare releases
  ARCH_RAW="$(uname -m)"
  case "$ARCH_RAW" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64) ARCH="amd64" ;;
    *) echo "Unsupported arch: $ARCH_RAW" >&2; exit 1 ;;
  esac
    URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${ARCH}.tgz"
    TGZ="$CACHE_DIR/cloudflared-darwin-${ARCH}.tgz"
    echo "Downloading cloudflared ($ARCH) from: $URL" >&2
    curl -fL --retry 3 --connect-timeout 10 --max-time 300 "$URL" -o "$TGZ"
    echo "Extracting to $BIN_DIR" >&2
    tar -xzf "$TGZ" -C "$BIN_DIR"
  CLOUDFLARED_BIN="$BIN_DIR/cloudflared"
  chmod +x "$CLOUDFLARED_BIN"
    # Remove macOS quarantine attribute if present
    if command -v xattr >/dev/null 2>&1; then
      xattr -d com.apple.quarantine "$CLOUDFLARED_BIN" >/dev/null 2>&1 || true
    fi
fi

echo "Starting Cloudflared tunnel to http://localhost:${PORT}" >&2
echo "Note: Look for the https://<random>.trycloudflare.com URL below" >&2
exec "$CLOUDFLARED_BIN" tunnel --url "http://localhost:${PORT}"
