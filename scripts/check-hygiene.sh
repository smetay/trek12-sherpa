#!/usr/bin/env bash
# Repository hygiene guard, run in CI and by `pnpm check`.
# 1. No tracked file above 300 KB (the lockfile is the only allowed exception).
# 2. No image / PDF outside the two folders that may legitimately hold our own assets.
#    Sheet photos and rulebook scans are copyrighted and must stay in the git-ignored `reference/`.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

status=0
limit=$((300 * 1024))

while IFS= read -r -d '' file; do
  [ "$file" = "pnpm-lock.yaml" ] && continue
  size=$(wc -c <"$file")
  if [ "$size" -gt "$limit" ]; then
    echo "::error file=$file::tracked file is $size bytes (> $limit)"
    status=1
  fi
done < <(git ls-files -z)

while IFS= read -r file; do
  case "$file" in
    apps/web/public/* | docs/img/*) ;;
    *)
      echo "::error file=$file::binary media must live in apps/web/public/ or docs/img/ (never commit sheet photos)"
      status=1
      ;;
  esac
done < <(git ls-files | grep -Ei '\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|tiff?|pdf)$' || true)

if [ "$status" -eq 0 ]; then
  echo "hygiene: ok"
fi
exit "$status"
