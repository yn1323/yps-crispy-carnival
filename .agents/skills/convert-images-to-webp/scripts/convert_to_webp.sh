#!/usr/bin/env bash
set -euo pipefail

mode="balanced"
output=""
delete_source=false
keep_metadata=false
force=false

usage() {
  echo "Usage: $0 [--mode balanced|high|compact|lossless] [--output FILE] [--delete-source] [--keep-metadata] [--force] INPUT" >&2
}

while (($#)); do
  case "$1" in
    --mode) mode="${2:?missing mode}"; shift 2 ;;
    --output) output="${2:?missing output path}"; shift 2 ;;
    --delete-source) delete_source=true; shift ;;
    --keep-metadata) keep_metadata=true; shift ;;
    --force) force=true; shift ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "Unknown option: $1" >&2; usage; exit 2 ;;
    *)
      if [[ -n "${input:-}" ]]; then echo "Only one input is supported" >&2; exit 2; fi
      input="$1"; shift ;;
  esac
done

[[ -n "${input:-}" ]] || { usage; exit 2; }
[[ -f "$input" ]] || { echo "Input not found: $input" >&2; exit 1; }

extension="${input##*.}"
extension="$(printf '%s' "$extension" | tr '[:upper:]' '[:lower:]')"
if [[ "$extension" == "webp" ]]; then
  echo "Already WebP: $input"
  exit 0
fi

if [[ -z "$output" ]]; then output="${input%.*}.webp"; fi
if [[ -e "$output" && "$force" != true ]]; then
  echo "Output already exists (use --force): $output" >&2
  exit 1
fi
mkdir -p "$(dirname "$output")"
input_size=$(stat -f %z "$input")

metadata="none"
if [[ "$keep_metadata" == true ]]; then metadata="all"; fi

case "$mode" in
  balanced) options=(-q 82 -m 6 -alpha_q 100) ;;
  high) options=(-q 88 -m 6 -alpha_q 100) ;;
  compact) options=(-q 74 -m 6 -alpha_q 100) ;;
  lossless) options=(-lossless -m 6) ;;
  *) echo "Unknown mode: $mode" >&2; exit 2 ;;
esac

tmp="${output}.tmp.$$.webp"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

if [[ "$extension" == "gif" ]]; then
  command -v gif2webp >/dev/null || { echo "gif2webp is required for GIF input" >&2; exit 1; }
  gif_options=(-m 6)
  [[ "$mode" == "lossless" ]] || gif_options+=(-lossy -q "${options[1]}")
  gif2webp "${gif_options[@]}" "$input" -o "$tmp" >/dev/null
else
  command -v cwebp >/dev/null || { echo "cwebp is required" >&2; exit 1; }
  cwebp -quiet -mt -metadata "$metadata" "${options[@]}" "$input" -o "$tmp"
fi

[[ -s "$tmp" ]] || { echo "Conversion produced an empty file" >&2; exit 1; }
file "$tmp" | grep -qi 'webp' || { echo "Output verification failed" >&2; exit 1; }
mv -f "$tmp" "$output"
trap - EXIT

if [[ "$delete_source" == true ]]; then rm -f "$input"; fi

output_size=$(stat -f %z "$output")
echo "Created: $output (${output_size} bytes, mode=$mode)"
echo "Source size: ${input_size} bytes"
