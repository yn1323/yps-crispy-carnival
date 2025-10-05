/**
 * 第1引数にオブジェクト配列、第2引数にオブジェクト配列のキーを複数配列で指定
 * 返り値は第1引数のオブジェクト配列で、第2引数で指定したキーが重複しているものを除外した配列
 */
export const uniqueBy = <T extends Record<string, unknown>>(array: T[], keys: (keyof T)[]): T[] => {
  const seen = new Set<string>();

  return array.filter((item) => {
    const key = keys.map((k) => item[k]).join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
