#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
revision=$(git -C "$repo_root" rev-parse --verify HEAD)
branch=$(git -C "$repo_root" symbolic-ref --short HEAD 2>/dev/null || printf 'detached')

if [[ -n $(git -C "$repo_root" status --porcelain -- rooiam-server Dockerfile.server.prod) ]]; then
  printf '%s\n' 'Server sources or Dockerfile have uncommitted changes. Build from a reviewed commit.' >&2
  exit 1
fi

image="rooiam-server:phone-${revision:0:12}"
docker build \
  --file "$repo_root/Dockerfile.server.prod" \
  --build-arg "ROOIAM_BUILD_REVISION=$revision" \
  --build-arg "ROOIAM_BUILD_BRANCH=$branch" \
  --tag "$image" \
  "$repo_root"

printf 'Built %s from commit %s\n' "$image" "$revision"
docker image inspect "$image" --format 'Image ID: {{.Id}} | Revision: {{index .Config.Labels "org.opencontainers.image.revision"}}'
