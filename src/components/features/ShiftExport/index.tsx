import { useMemo, useState } from "react";
import { buildExportSchedule } from "./script";
import type { ExportView, ShiftExportData } from "./types";
import { useExportDownload } from "./useExportDownload";
import { ShiftExportView } from "./View";

export function ShiftExportPage({ data }: { data: ShiftExportData }) {
  const [view, setView] = useState<ExportView>("overview");
  const [splitPeriod, setSplitPeriod] = useState(false);
  // 店に貼り出す印刷物へメモが混ざらないよう、連絡事項は管理者が選んだときだけ出力する。
  const [includeNotes, setIncludeNotes] = useState(false);
  const schedule = useMemo(
    () => buildExportSchedule(data, splitPeriod, includeNotes, view),
    [data, splitPeriod, includeNotes, view],
  );
  const download = useExportDownload(schedule);
  return (
    <ShiftExportView
      schedule={schedule}
      download={download}
      onViewChange={setView}
      onSplitPeriodChange={setSplitPeriod}
      includeNotes={includeNotes}
      onIncludeNotesChange={setIncludeNotes}
    />
  );
}

export type { ShiftExportData } from "./types";
export { useOpenShiftExport, useReceivedShiftExport } from "./useShiftExportTransfer";
