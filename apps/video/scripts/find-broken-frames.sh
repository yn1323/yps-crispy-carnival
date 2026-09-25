#!/bin/bash
# 書き出した動画から、その1フレームだけ前後と大きく違う「壊れたフレーム」を探す。
# 隣り合うフレームのSSIMが前後とも低く、1フレーム飛ばした前後はよく似ている場合に壊れたとみなす。
# カメラの移動など連続した変化は拾わない。見つかった場合は終了コード1で終わる。
# 使い方: pnpm --filter @shiftori/video check:frames out/shiftori-intro.mp4
set -euo pipefail

INPUT=${1:?動画ファイルを指定してください}
NEXT_LOG=$(mktemp)
SKIP_LOG=$(mktemp)
trap 'rm -f "$NEXT_LOG" "$SKIP_LOG"' EXIT

measure_ssim() {
  local offset=$1 log=$2
  ffmpeg -v error -i "$INPUT" -i "$INPUT" -lavfi \
    "[0:v]format=yuv420p,scale=480:270[a];[1:v]format=yuv420p,scale=480:270,trim=start_frame=${offset},setpts=PTS-STARTPTS[b];[a][b]ssim=stats_file=${log}" \
    -f null -
}

extract_ssim() {
  awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^All:/) { split($i, value, ":"); print value[2] } }' "$1"
}

measure_ssim 1 "$NEXT_LOG"
measure_ssim 2 "$SKIP_LOG"

paste <(extract_ssim "$NEXT_LOG") <(extract_ssim "$SKIP_LOG"; echo 1) | awk '
  { next_ssim[NR - 1] = $1; skip_ssim[NR - 1] = $2 }
  END {
    found = 0
    for (n = 1; n < NR - 1; n++) {
      low = (next_ssim[n - 1] < next_ssim[n]) ? next_ssim[n - 1] : next_ssim[n]
      if (low < 0.9 && skip_ssim[n - 1] - low > 0.08) {
        printf "壊れたフレーム %d: 前後とのSSIM %.3f / %.3f、飛ばした前後 %.3f\n", n, next_ssim[n - 1], next_ssim[n], skip_ssim[n - 1]
        found++
      }
    }
    printf "壊れたフレーム: %d\n", found
    exit found > 0 ? 1 : 0
  }'
