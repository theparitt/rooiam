#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo_dir/.env.docker.public.prod"

if [[ ! -f "$env_file" ]]; then
  printf 'Missing production environment file: %s\n' "$env_file" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required to build the RooIAM server.\n' >&2
  exit 1
fi

export ROOIAM_BUILD_REVISION="$(git -C "$repo_dir" rev-parse HEAD)"
ROOIAM_BUILD_BRANCH="$(git -C "$repo_dir" symbolic-ref --quiet --short HEAD || true)"
ROOIAM_BUILD_VERSION="$(git -C "$repo_dir" describe --tags --exact-match --match 'v[0-9]*' 2>/dev/null || true)"

if [[ -n "$ROOIAM_BUILD_BRANCH" ]]; then
  export ROOIAM_BUILD_BRANCH
  export ROOIAM_BUILD_REF="refs/heads/$ROOIAM_BUILD_BRANCH"
else
  export ROOIAM_BUILD_BRANCH=detached
  if [[ -n "$ROOIAM_BUILD_VERSION" ]]; then
    export ROOIAM_BUILD_REF="refs/tags/$ROOIAM_BUILD_VERSION"
  else
    export ROOIAM_BUILD_REF=HEAD
  fi
fi

export ROOIAM_BUILD_VERSION="${ROOIAM_BUILD_VERSION:-unreleased}"
export ROOIAM_BUILD_TIME_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf 'Building RooIAM server %s (%s) at %s\n' \
  "$ROOIAM_BUILD_VERSION" "${ROOIAM_BUILD_REVISION:0:7}" "$ROOIAM_BUILD_TIME_UTC"

cd "$repo_dir"
docker compose -f docker-compose.prod.yml --env-file "$env_file" build "$@" server
