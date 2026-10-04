import { useMemo, useState } from "react";
import { buildExportSchedule } from "./script";
import type { ShiftExportData } from "./types";
import { useExportDownload } from "./useExportDownload";
import { ShiftExportView } from "./View";

export function ShiftExportPage({ data }: { data: ShiftExportData }) {
  const [splitPeriod, setSplitPeriod] = useState(false);
  // 店に貼り出す印刷物へメモが混ざらないよう、メモ一覧は管理者が選んだときだけ付ける。
  const [includeNotes, setIncludeNotes] = useState(false);
  const schedule = useMemo(
    () => buildExportSchedule(data, splitPeriod, includeNotes),
    [data, splitPeriod, includeNotes],
  );
  const download = useExportDownload(schedule);
  return (
    <ShiftExportView
      schedule={schedule}
      download={download}
      onSplitPeriodChange={setSplitPeriod}
      includeNotes={includeNotes}
      onIncludeNotesChange={setIncludeNotes}
    />
  );
}

export type { ShiftExportData } from "./types";
export { useOpenShiftExport, useReceivedShiftExport } from "./useShiftExportTransfer";
