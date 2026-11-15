import { useMemo, useState } from "react";
import { buildExportSchedule } from "./script";
import type { ShiftExportData } from "./types";
import { useExportDownload } from "./useExportDownload";
import { ShiftExportView } from "./View";

export function ShiftExportPage({ data }: { data: ShiftExportData }) {
  const [splitPeriod, setSplitPeriod] = useState(false);
  // 店に貼り出す印刷物へメモが混ざらないよう、連絡事項は管理者が選んだときだけ出力する。
  const [includeNotes, setIncludeNotes] = useState(false);
  // シフト表を「くわしく」で開いていた場合は、ポジションと休憩を出力する状態から始める。
  const [includeDetails, setIncludeDetails] = useState(data.includeDetailsByDefault ?? false);
  const schedule = useMemo(
    () => buildExportSchedule(data, splitPeriod, includeNotes, includeDetails),
    [data, splitPeriod, includeNotes, includeDetails],
  );
  const download = useExportDownload(schedule);
  return (
    <ShiftExportView
      schedule={schedule}
      download={download}
      onSplitPeriodChange={setSplitPeriod}
      includeNotes={includeNotes}
      onIncludeNotesChange={setIncludeNotes}
      includeDetails={includeDetails}
      onIncludeDetailsChange={setIncludeDetails}
    />
  );
}

export type { ShiftExportData } from "./types";
export { useOpenShiftExport, useReceivedShiftExport } from "./useShiftExportTransfer";
