#!/usr/bin/env bash
# Run on the server to pull the latest code and (re)start the site.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d
docker compose ps
