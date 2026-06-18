import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { lockDailyStaffOrderAtom, shiftConfigAtom } from "../stores";

export const useLockedDailyStaffOrder = (date: string | null | undefined) => {
  const config = useAtomValue(shiftConfigAtom);
  const lockDailyStaffOrder = useSetAtom(lockDailyStaffOrderAtom);
  const hasStaffs = config.staffs.length > 0;
  const staffOrderKey = config.staffs
    .map((staff) => `${staff.id}:${staff.displayOrder ?? ""}:${staff.createdAt ?? ""}`)
    .join("|");
  // 同じ日付でもスタッフのデフォルト順や募集タイプが変わったら、固定順を作り直す。
  const lockInput = useMemo(
    () => ({
      date,
      hasStaffs,
      scope: `${staffOrderKey}:${config.submissionPattern?.kind ?? "time"}`,
    }),
    [date, hasStaffs, staffOrderKey, config.submissionPattern?.kind],
  );

  useEffect(() => {
    if (!lockInput.date || !lockInput.hasStaffs) return;
    lockDailyStaffOrder(lockInput.date);
  }, [lockDailyStaffOrder, lockInput]);
};
