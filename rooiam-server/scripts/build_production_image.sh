#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
revision=$(git -C "$repo_root" rev-parse --verify HEAD)
branch=$(git -C "$repo_root" symbolic-ref --short HEAD 2>/dev/null || printf 'detached')
source_ref=$(git -C "$repo_root" symbolic-ref HEAD 2>/dev/null || git -C "$repo_root" describe --tags --exact-match 2>/dev/null || printf 'detached')
release_version=$(git -C "$repo_root" describe --tags --exact-match 2>/dev/null || printf 'unreleased')
built_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [[ -n $(git -C "$repo_root" status --porcelain -- rooiam-server Dockerfile.server.prod) ]]; then
  printf '%s\n' 'Server sources or Dockerfile have uncommitted changes. Build from a reviewed commit.' >&2
  exit 1
fi

image="rooiam-server:phone-${revision:0:12}"
docker build \
  --file "$repo_root/Dockerfile.server.prod" \
  --build-arg "ROOIAM_BUILD_REVISION=$revision" \
  --build-arg "ROOIAM_BUILD_BRANCH=$branch" \
  --build-arg "ROOIAM_BUILD_REF=$source_ref" \
  --build-arg "ROOIAM_BUILD_VERSION=$release_version" \
  --build-arg "ROOIAM_BUILD_TIME_UTC=$built_at_utc" \
  --tag "$image" \
  "$repo_root"

printf 'Built %s from commit %s\n' "$image" "$revision"
docker image inspect "$image" --format 'Image ID: {{.Id}} | Revision: {{index .Config.Labels "org.opencontainers.image.revision"}}'
