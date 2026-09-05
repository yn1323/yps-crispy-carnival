import { useLayoutEffect, useRef, useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getExportFileName } from "./script";
import type { ExportSchedule } from "./types";

type Format = "pdf" | "xlsx";
type Download = { url: string; fileName: string; format: Format; schedule: ExportSchedule };

export function useExportDownload(schedule: ExportSchedule) {
  const [download, setDownload] = useState<Download | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const currentSchedule = useRef(schedule);
  currentSchedule.current = schedule;
  const generation = useRef(0);
  const url = useRef<string | null>(null);
  const revoke = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  };
  const { run, isRunning, release } = useSingleFlight(async (requestedFormat: Format) => {
    const request = ++generation.current;
    setFormat(requestedFormat);
    setError(null);
    setDownload(null);
    revoke();
    try {
      const blob =
        requestedFormat === "pdf"
          ? await (await import("./pdf")).createShiftPdf(schedule)
          : await (await import("./excel")).createShiftExcel(schedule);
      if (request !== generation.current || currentSchedule.current !== schedule) return;
      const createdUrl = URL.createObjectURL(blob);
      url.current = createdUrl;
      const fileName = getExportFileName(schedule, requestedFormat);
      setDownload({ url: createdUrl, fileName, format: requestedFormat, schedule });
      const link = document.createElement("a");
      link.href = createdUrl;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      if (request === generation.current && currentSchedule.current === schedule) {
        setError("ファイルを作成できませんでした。もう一度お試しください。");
      }
    }
  });
  useLayoutEffect(() => {
    currentSchedule.current = schedule;
    generation.current += 1;
    setDownload(null);
    setError(null);
    setFormat(null);
    release();
    return () => {
      generation.current += 1;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
    };
  }, [schedule, release]);
  return {
    generate: run,
    isGenerating: isRunning,
    generatingFormat: format,
    download: download?.schedule === schedule ? download : null,
    error,
  };
}
