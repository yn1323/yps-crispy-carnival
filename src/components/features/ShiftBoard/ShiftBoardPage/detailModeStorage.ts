// シフト表の「シンプル / くわしく」の選択を端末に覚える。
// 保存できない環境（プライベートブラウズなど）では、覚えずに初期状態へ戻るだけにする。

const STORAGE_KEY = "shiftori:shiftBoard:detailMode";

/** 利用者が選んだ表示。まだ選んでいない場合と、読めない場合はnullを返す。 */
export const readStoredDetailMode = (): boolean | null => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "detail") return true;
    if (value === "simple") return false;
    return null;
  } catch {
    return null;
  }
};

export const storeDetailMode = (isDetailMode: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, isDetailMode ? "detail" : "simple");
  } catch {
    // 保存できなくても表示の切り替えは続ける。
  }
};
