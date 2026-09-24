import { getInfo, loadFont } from "@remotion/google-fonts/NotoSansJP";
import { ALL_TEXT } from "./copy";

// 日本語は100を超える分割ファイルに分かれているため、画面に出す文字を含むものだけ読み込む
const unicodeRanges: Record<string, string> = getInfo().unicodeRanges;

const parseRanges = (value: string) =>
  value.split(",").map((part) => {
    const [start, end] = part.trim().replace(/^U\+/i, "").split("-");
    return [Number.parseInt(start, 16), Number.parseInt(end ?? start, 16)] as const;
  });

const codePoints = [...new Set(ALL_TEXT)].map((char) => char.codePointAt(0) ?? 0);

const chunkSubsets = Object.entries(unicodeRanges)
  .filter(([subset]) => /^\[\d+\]$/.test(subset))
  .filter(([, ranges]) => {
    const parsed = parseRanges(ranges);
    return codePoints.some((point) => parsed.some(([start, end]) => point >= start && point <= end));
  })
  .map(([subset]) => subset);

export const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  // 必要な分割ファイルだけに絞ったうえでの件数なので、警告は出さない
  ignoreTooManyRequestsWarning: true,
  subsets: [...chunkSubsets, "latin"] as Parameters<typeof loadFont>[1] extends { subsets?: infer S } ? S : never,
});
