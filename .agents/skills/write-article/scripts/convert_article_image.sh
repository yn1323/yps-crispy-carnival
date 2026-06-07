#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  convert_article_image.sh path/to/image.png [path/to/output.webp]

Normalizes the PNG in place to 256x256 on a transparent canvas and writes a WebP.
The PNG is kept for source/history, but Markdown should reference only the WebP.
USAGE
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

input_png="$1"
output_webp="${2:-${input_png%.png}.webp}"

if [[ ! -f "$input_png" ]]; then
  echo "Input PNG not found: $input_png" >&2
  exit 1
fi

if [[ "${input_png##*.}" != "png" ]]; then
  echo "Input must be a .png file: $input_png" >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required." >&2
  exit 1
fi

if ! command -v cwebp >/dev/null 2>&1; then
  echo "cwebp is required." >&2
  exit 1
fi

tmp_png="$(mktemp "${TMPDIR:-/tmp}/article-image.XXXXXX.png")"
trap 'rm -f "$tmp_png"' EXIT

magick "$input_png" -background none -alpha on -resize 256x256 -gravity center -extent 256x256 "$tmp_png"
mv "$tmp_png" "$input_png"

alpha_min="$(magick "$input_png" -alpha extract -format "%[fx:minima]" info:)"
if awk "BEGIN { exit !($alpha_min >= 1) }"; then
  echo "PNG has no transparent pixels after normalization. Regenerate with transparent background: $input_png" >&2
  exit 1
fi

mkdir -p "$(dirname "$output_webp")"
cwebp -quiet -lossless "$input_png" -o "$output_webp"

dimensions="$(magick identify -format "%wx%h" "$input_png")"
if [[ "$dimensions" != "256x256" ]]; then
  echo "Unexpected output dimensions: $dimensions" >&2
  exit 1
fi

echo "Wrote $input_png and $output_webp"
