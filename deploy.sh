#!/usr/bin/env bash
# Upload public/widget.js to the "widget" bucket in Supabase Storage.
# Sets cache-control to 60s so updates roll out within a minute.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Error: .env not found. Copy .env.example to .env and fill in SUPABASE_SERVICE_KEY."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${SUPABASE_URL:?SUPABASE_URL not set in .env}"
: "${SUPABASE_SERVICE_KEY:?SUPABASE_SERVICE_KEY not set in .env}"

BUCKET="widget"
LOCAL_FILE="public/widget.js"
OBJECT_PATH="widget.js"

if [ ! -f "$LOCAL_FILE" ]; then
  echo "Error: $LOCAL_FILE not found."
  exit 1
fi

echo "Uploading $LOCAL_FILE → $BUCKET/$OBJECT_PATH..."

RESP_BODY="$(mktemp)"
trap 'rm -f "$RESP_BODY"' EXIT

HTTP_STATUS=$(curl -sS -o "$RESP_BODY" -w "%{http_code}" \
  -X POST \
  "$SUPABASE_URL/storage/v1/object/$BUCKET/$OBJECT_PATH" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/javascript" \
  -H "Cache-Control: max-age=60" \
  -H "x-upsert: true" \
  --data-binary "@$LOCAL_FILE")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
  echo "✓ Deployed."
  echo "  URL:   $SUPABASE_URL/storage/v1/object/public/$BUCKET/$OBJECT_PATH"
  echo "  Cache: 60s (existing prototypes pick up the new version within a minute)"
else
  echo "✗ Upload failed (HTTP $HTTP_STATUS):"
  cat "$RESP_BODY"
  echo
  exit 1
fi
