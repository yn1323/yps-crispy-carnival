// 時間指定のPCの日別表示で、メニューから最後に選んだポジションを、店舗ごとに端末へ覚える。
// 次に新しく入れる勤務のポジションに使う。保存できない環境（プライベートブラウズなど）では、覚えずに既定のポジションへ戻るだけにする。

export const lastPositionStorageKey = (shopId: string): string => `shiftori:shiftBoard:lastPosition:${shopId}`;

/** その店舗で最後に選んだポジションのID。まだ選んでいない場合と、読めない場合はnullを返す。 */
export const readLastPositionId = (shopId: string): string | null => {
  try {
    return window.localStorage.getItem(lastPositionStorageKey(shopId));
  } catch {
    return null;
  }
};

export const storeLastPositionId = (shopId: string, positionId: string): void => {
  try {
    window.localStorage.setItem(lastPositionStorageKey(shopId), positionId);
  } catch {
    // 保存できなくても割当は続ける。
  }
};
