#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

check_cmd() {
  local cmd="$1"
  local label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    printf "OK   %-18s %s\n" "$label" "$(command -v "$cmd")"
  else
    printf "MISS %-18s not found\n" "$label"
    return 1
  fi
}

parse_major() {
  local version="$1"
  version="${version#v}"
  echo "${version%%.*}"
}

status=0
require_aws="${REQUIRE_AWS:-0}"

echo "Checking core tools..."
check_cmd "git" "git" || status=1
check_cmd "node" "node" || status=1
check_cmd "npm" "npm" || status=1
check_cmd "python3" "python3" || status=1
check_cmd "pip" "pip" || status=1

if command -v aws >/dev/null 2>&1; then
  printf "OK   %-18s %s\n" "aws-cli" "$(command -v aws)"
else
  if [[ "$require_aws" == "1" ]]; then
    printf "MISS %-18s not found\n" "aws-cli"
    status=1
  else
    printf "WARN %-18s not found (needed only for AWS operations)\n" "aws-cli"
  fi
fi

if command -v node >/dev/null 2>&1; then
  node_version="$(node -v)"
  node_major="$(parse_major "$node_version")"
  if [[ "$node_major" -lt 18 ]]; then
    echo "FAIL node version is $node_version (need >= v18)"
    status=1
  else
    echo "OK   node version          $node_version"
  fi
fi

echo
echo "Checking project files..."
if [[ -f "$ROOT_DIR/frontend/package.json" ]]; then
  echo "OK   frontend package      $ROOT_DIR/frontend/package.json"
else
  echo "MISS frontend package      not found"
  status=1
fi

if [[ "$status" -ne 0 ]]; then
  echo
  echo "One or more checks failed."
  exit 1
fi

echo
echo "All prerequisite checks passed."
