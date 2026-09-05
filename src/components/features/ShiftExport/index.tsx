import { useMemo } from "react";
import { buildExportSchedule } from "./script";
import type { ShiftExportData } from "./types";
import { useExportDownload } from "./useExportDownload";
import { ShiftExportView } from "./View";

export function ShiftExportPage({ data }: { data: ShiftExportData }) {
  const schedule = useMemo(() => buildExportSchedule(data), [data]);
  const download = useExportDownload(schedule);
  return <ShiftExportView schedule={schedule} download={download} />;
}

export { getExportBlockMessage } from "./script";
