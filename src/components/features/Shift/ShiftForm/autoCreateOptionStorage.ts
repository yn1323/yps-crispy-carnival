// 自動作成のダイアログで選んだオプションを、端末に覚える。
// 開くたびに選び直さずに済むようにする。
// 保存できない環境（プライベートブラウズなど）では、覚えずに、初めの状態から始めるだけにする。

export const AUTO_CREATE_BREAK_OPTION_STORAGE_KEY = "shiftori:shiftBoard:autoCreateIncludesBreaks";
export const AUTO_CREATE_AI_OPTION_STORAGE_KEY = "shiftori:shiftBoard:autoCreateUsesAi";

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const store = (key: string, value: boolean): void => {
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // 保存できなくても、その回の選択は使える。
  }
};

/** 休憩時間も作るか。外したことを覚えている端末でだけfalseを返す。読めない場合と、知らない値の場合はtrueを返す。 */
export const readAutoCreateIncludesBreaks = (): boolean => read(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY) !== "false";

export const storeAutoCreateIncludesBreaks = (includesBreaks: boolean): void =>
  store(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY, includesBreaks);

/**
 * メモの内容に合わせて、AIで手直しするか。入れたことを覚えている端末でだけtrueを返す。
 * AIはメモを外部へ送り、回数にも上限があるため、選んだことのない端末と、読めない場合、知らない値の場合はfalseを返す。
 */
export const readAutoCreateUsesAi = (): boolean => read(AUTO_CREATE_AI_OPTION_STORAGE_KEY) === "true";

export const storeAutoCreateUsesAi = (usesAi: boolean): void => store(AUTO_CREATE_AI_OPTION_STORAGE_KEY, usesAi);
