import { createFileRoute } from "@tanstack/react-router";
import { HelpShiftExportPage } from "@/src/pages/help/shiftExport";
import { buildHelpShiftExportPageHead } from "@/src/pages/help/shiftExportMeta";

export const Route = createFileRoute("/help/scenarios/shift-export")({
  head: buildHelpShiftExportPageHead,
  component: HelpShiftExportPage,
});
