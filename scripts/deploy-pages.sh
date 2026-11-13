#!/usr/bin/env bash
# Publish the Studio with the recorded runs to GitHub Pages (branch gh-pages).
# usage: bash scripts/deploy-pages.sh [repo-name]   (default: plumb)
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="${1:-plumb}"
OWNER="$(gh repo view --json owner -q .owner.login)"
(cd demo && node ../bin/plumb.mjs export --out ../studio/public/data)
(cd studio && VITE_BASE="/${NAME}/" VITE_STATIC=1 npm run build)
node scripts/prerender-routes.mjs studio/dist
TMP="$(mktemp -d)"
cp -r studio/dist/. "$TMP/"
touch "$TMP/.nojekyll"
REMOTE="$(git remote get-url origin)"
(
  cd "$TMP"
  git init -q -b gh-pages
  git add -A
  git -c user.name="${GIT_AUTHOR_NAME:-zkasuran}" -c user.email="${GIT_AUTHOR_EMAIL:-zkasuran@users.noreply.github.com}" commit -q -m "Studio build with recorded runs"
  git push -q --force "$REMOTE" gh-pages
)
rm -rf "$TMP"
gh api -X POST "repos/${OWNER}/${NAME}/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || true
echo "https://${OWNER}.github.io/${NAME}/"
