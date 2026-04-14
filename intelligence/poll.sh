#!/bin/bash
# Poll stroby@stroby.ai for new newsletter issues from signed-up creators.
# Runs every 2 hours via launchd.
set -euo pipefail

# Load the API secret from .env.local
ENV_FILE="$(dirname "$0")/../.env.local"
if [ -f "$ENV_FILE" ]; then
    INTELLIGENCE_API_SECRET=$(grep '^INTELLIGENCE_API_SECRET=' "$ENV_FILE" | cut -d= -f2-)
fi

if [ -z "${INTELLIGENCE_API_SECRET:-}" ]; then
    echo "ERROR: INTELLIGENCE_API_SECRET not found"
    exit 1
fi

echo "==== $(date '+%Y-%m-%d %H:%M:%S') intelligence poll starting ===="
# SECURITY: Pass auth header via --config stdin to avoid exposing the secret in `ps` output
curl -s -X POST "http://127.0.0.1:8001/poll?max_issues=30" \
    --config <(echo "header = \"Authorization: Bearer $INTELLIGENCE_API_SECRET\"") \
    | python3 -m json.tool
echo "==== $(date '+%Y-%m-%d %H:%M:%S') intelligence poll done ===="
