#!/usr/bin/env bash
#
# Upload OTA update bundle to the remote server.
#
# Usage:
#   bash scripts/cap-upload.sh <user@host:/path/to/updates>
#
# Example:
#   bash scripts/cap-upload.sh deploy@example.com:/var/www/updates/dodobox
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_UPDATES="$ROOT_DIR/dist/updates"

if [ ! -d "$DIST_UPDATES" ]; then
  echo "ERROR: dist/updates/ not found. Run 'pnpm cap:bundle' first."
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 <user@host:/path/to/updates>"
  echo ""
  echo "This will rsync dist/updates/ to the remote destination."
  exit 1
fi

DEST="$1"

echo "[cap-upload] Uploading to $DEST ..."
rsync -avz --progress "$DIST_UPDATES/" "$DEST/"
echo "[cap-upload] Done!"
