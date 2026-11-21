// たたんだ人のまとまりの見出しの横に、薄く出す名前。

const NAME_LIMIT = 3;

// 名字と名前の間の空白で区切り、名字だけを出す。空白のない名前は、そのまま出す。
const toShortName = (name: string): string => name.trim().split(/[\s　]+/)[0] || name;

/** 「中村・高橋・伊藤・ほか1人」。先頭の3人までを名字で並べ、残りは人数にまとめる。 */
export const buildStaffNamesLabel = (names: readonly string[]): string => {
  const shown = names.slice(0, NAME_LIMIT).map(toShortName);
  const restCount = names.length - shown.length;
  return [...shown, ...(restCount > 0 ? [`ほか${restCount}人`] : [])].join("・");
};
