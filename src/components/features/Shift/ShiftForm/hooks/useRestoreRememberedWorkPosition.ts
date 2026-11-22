import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { restoreRememberedWorkPositionAtom, shiftConfigAtom } from "../stores";

/** 前にこの店舗で最後に選んだポジションを、次に入れるポジションへ戻す。店舗とポジションが読み込まれてから行う。 */
export const useRestoreRememberedWorkPosition = () => {
  const { shopId, positions } = useAtomValue(shiftConfigAtom);
  const restoreRememberedWorkPosition = useSetAtom(restoreRememberedWorkPositionAtom);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 店舗かポジションが変わったときに戻し直すため、値の変化を見る。
  useEffect(() => {
    restoreRememberedWorkPosition();
  }, [restoreRememberedWorkPosition, shopId, positions]);
};
