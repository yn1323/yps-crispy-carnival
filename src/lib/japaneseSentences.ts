/** 句点ごとに文を分ける。スマホでも1文を1行で読めるよう、文ごとに改行して表示するときに使う。 */
export function splitJapaneseSentences(text: string): string[] {
  return (text.match(/[^。]+。|[^。]+$/g) ?? []).map((sentence) => sentence.trim()).filter(Boolean);
}
