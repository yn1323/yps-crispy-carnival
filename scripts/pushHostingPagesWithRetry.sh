#!/usr/bin/env bash

set -euo pipefail

max_attempts="${HOSTING_PAGES_PUSH_MAX_ATTEMPTS:-5}"
base_delay_seconds="${HOSTING_PAGES_PUSH_RETRY_DELAY_SECONDS:-2}"

if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]] || ! [[ "$base_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "::error::Invalid hosting-pages retry configuration."
  exit 1
fi

for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  git pull --rebase origin main
  if git push origin HEAD:main; then
    exit 0
  fi
  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "::error::hosting-pages push failed after ${attempt} attempts."
    exit 1
  fi
  sleep "$((attempt * base_delay_seconds))"
done
