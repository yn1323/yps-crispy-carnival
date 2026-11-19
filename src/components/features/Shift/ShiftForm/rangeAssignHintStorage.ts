// 「バーをなぞると ポジションを変えられます」の案内を、一度使った端末では出さない。
// 保存できない環境（プライベートブラウズなど）では、覚えずに案内を出し続けるだけにする。

export const RANGE_ASSIGN_HINT_STORAGE_KEY = "shiftori:shiftBoard:rangeAssignHint";

/** バーの範囲を選んでポジションか休憩を入れたことがあるか。読めない場合はfalseを返す。 */
export const readRangeAssignHintDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(RANGE_ASSIGN_HINT_STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
};

export const storeRangeAssignHintDismissed = (): void => {
  try {
    window.localStorage.setItem(RANGE_ASSIGN_HINT_STORAGE_KEY, "dismissed");
  } catch {
    // 保存できなくても割当は続ける。
  }
};
