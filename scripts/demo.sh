#!/usr/bin/env bash
# One command to see Plumb with its recorded runs. No Kane account needed.
#   npm run demo            install, build the Studio, serve it on http://127.0.0.1:4310
#   npm run demo -- prepare install and build only
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install --no-audit --no-fund
(cd demo && node ../bin/plumb.mjs export --out ../studio/public/data)
(cd studio && { [ -d node_modules ] || npm install --no-audit --no-fund; } && npm run build)
if [ "${1:-}" = "prepare" ]; then echo "Studio built. Start it with: cd demo && node ../bin/plumb.mjs studio"; exit 0; fi
cd demo && exec node ../bin/plumb.mjs studio
