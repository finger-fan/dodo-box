#!/bin/sh
set -e
cd "$(dirname "$0")"

PORT=18302
BASE="http://127.0.0.1:$PORT"
AUTH="-u admin:dodobox2026"

echo "=== 1. / → 301 redirect ==="
curl -sI $AUTH $BASE/ | head -3
echo ""

echo "=== 2. /download/ → 200 ==="
curl -sI $AUTH $BASE/download/ | head -3
echo ""

echo "=== 3. /download/versions.json ==="
curl -s $AUTH $BASE/download/versions.json
echo ""

echo "=== 4. /download/apk/ APK ==="
curl -sI $AUTH $BASE/download/apk/*.apk 2>/dev/null | head -4 || echo "(no apk files)"
echo ""

echo "=== 5. No auth → 401 ==="
curl -sI $BASE/download/ | head -3
