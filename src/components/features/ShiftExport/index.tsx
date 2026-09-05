import { useMemo, useState } from "react";
import { buildExportSchedule } from "./script";
import type { ShiftExportData } from "./types";
import { useExportDownload } from "./useExportDownload";
import { ShiftExportView } from "./View";

export function ShiftExportPage({ data }: { data: ShiftExportData }) {
  const [splitPeriod, setSplitPeriod] = useState(false);
  const schedule = useMemo(() => buildExportSchedule(data, splitPeriod), [data, splitPeriod]);
  const download = useExportDownload(schedule);
  return <ShiftExportView schedule={schedule} download={download} onSplitPeriodChange={setSplitPeriod} />;
}

export { getExportBlockMessage } from "./script";
