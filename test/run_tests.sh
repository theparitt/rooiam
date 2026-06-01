#!/usr/bin/env bash
# Run all Hurl tests against the server in test mode.
#
# IMPORTANT:
#   The Rooiam server MUST be started with ROOIAM_MODE=test before running this script.
#   If the server is running in demo or production mode, tests that depend on /v1/test/*
#   will fail with 404 and the suite is expected to fail.
#
# Usage:
#   bash run_tests.sh                       # run all files
#   bash run_tests.sh --verbose             # show full request/response on failure
#   bash run_tests.sh 03_demo_login.hurl    # run a single file

cd "$(dirname "$0")"

VERBOSE=0
FILES=()

for arg in "$@"; do
    case "$arg" in
        --verbose) VERBOSE=1 ;;
        *.hurl)    FILES+=("$arg") ;;
        *)         echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

if [ ${#FILES[@]} -eq 0 ]; then
    FILES=(*.hurl)
fi

HURL_ARGS=(
    --variables-file test.vars
    --test
    --jobs 1
)

if [ "$VERBOSE" -eq 1 ]; then
    HURL_ARGS+=(--error-format long)
fi

echo "Running tests — server MUST already be running with ROOIAM_MODE=test"
echo "If not, /v1/test/* routes will be missing and this suite will fail."
echo "Files: ${#FILES[@]}"
echo ""

hurl "${HURL_ARGS[@]}" "${FILES[@]}"
