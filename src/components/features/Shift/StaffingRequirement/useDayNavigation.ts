import { useState } from "react";
import { useDialog } from "@/src/components/ui/Dialog";

type UseDayNavigationParams = {
  setSelectedDay: (day: number) => void;
  hasChanges: boolean;
  onResetCurrentDay: () => void;
};

export const useDayNavigation = ({ setSelectedDay, hasChanges, onResetCurrentDay }: UseDayNavigationParams) => {
  const [pendingDay, setPendingDay] = useState<number | null>(null);
  const unsavedDialog = useDialog();

  // 曜日タブ切替（未保存チェック付き）
  const handleDayChange = (newDay: number) => {
    if (hasChanges) {
      setPendingDay(newDay);
      unsavedDialog.open();
    } else {
      setSelectedDay(newDay);
    }
  };

  // 未保存の変更を破棄して移動
  const handleDiscardAndMove = () => {
    if (pendingDay === null) return;
    onResetCurrentDay();
    setSelectedDay(pendingDay);
    setPendingDay(null);
    unsavedDialog.close();
  };

  // 未保存ダイアログのキャンセル
  const handleCancelDiscard = () => {
    setPendingDay(null);
    unsavedDialog.close();
  };

  return {
    unsavedDialog,
    handleDayChange,
    handleDiscardAndMove,
    handleCancelDiscard,
  };
};
