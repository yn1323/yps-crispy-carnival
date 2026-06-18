#!/usr/bin/env bash
set -euo pipefail

runner_os="${RUNNER_OS:-$(uname -s)}"
if [[ "$runner_os" != "Linux" ]]; then
  echo "Skipping apt setup on ${runner_os}"
  exit 0
fi

sudo tee /etc/apt/apt.conf.d/99ci-network-retries >/dev/null <<'APT_CONF'
Acquire::Retries "5";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
Acquire::ForceIPv4 "true";
APT_CONF

source_files=()
if [[ -f /etc/apt/sources.list ]]; then
  source_files+=(/etc/apt/sources.list)
fi

if [[ -d /etc/apt/sources.list.d ]]; then
  while IFS= read -r -d '' source_file; do
    source_files+=("$source_file")
  done < <(find /etc/apt/sources.list.d -maxdepth 1 \( -name "*.list" -o -name "*.sources" \) -print0)
fi

if (( ${#source_files[@]} > 0 )); then
  sudo sed -i \
    -e "s#http://azure.archive.ubuntu.com/ubuntu#http://archive.ubuntu.com/ubuntu#g" \
    -e "s#https://azure.archive.ubuntu.com/ubuntu#https://archive.ubuntu.com/ubuntu#g" \
    "${source_files[@]}"
fi

if (( $# == 0 )); then
  exit 0
fi

for attempt in 1 2 3; do
  echo "Installing apt packages (attempt ${attempt}/3): $*"
  if timeout 5m sudo apt-get update && timeout 10m sudo apt-get install -y --no-install-recommends "$@"; then
    exit 0
  fi

  if [[ "$attempt" == "3" ]]; then
    echo "::error::apt package install failed after 3 attempts: $*"
    exit 1
  fi

  sleep "$((attempt * 15))"
done
