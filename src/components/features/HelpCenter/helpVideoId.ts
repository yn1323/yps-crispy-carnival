/**
 * 計測で使う、ヘルプの動画のID。`../videos/<使い方のID>/<ファイル名>.mp4`から、使い方のIDとファイル名をつないで作る。
 * 例：`../videos/set-positions-and-breaks/pc-range-assign.mp4`は`set-positions-and-breaks-pc-range-assign`になる。
 */
export function toHelpVideoId(src: string): string {
  return src
    .replace(/^.*videos\//, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[/_]/g, "-")
    .toLowerCase();
}
