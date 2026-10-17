import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftFormHeader } from "@/src/components/features/Shift/ShiftForm";
import type { ShiftBoardData } from "../types";
import { ShiftBoardPageView } from "./ShiftBoardPageView";
import {
  type ShiftBoardDateNotes,
  type ShiftBoardExportData,
  useShiftBoardPageController,
} from "./useShiftBoardPageController";

export type ShiftBoardPageProps = {
  data: ShiftBoardData;
  recruitmentId: Id<"recruitments">;
  layout?: "legacy" | "app";
  header?: ShiftFormHeader;
  onExport?: (data: ShiftBoardExportData) => void;
  dateNotes?: ShiftBoardDateNotes;
};

export const ShiftBoardPage = ({
  data,
  recruitmentId,
  layout = "legacy",
  header,
  onExport,
  dateNotes,
}: ShiftBoardPageProps) => {
  const controller = useShiftBoardPageController(data, recruitmentId, onExport, dateNotes);

  return <ShiftBoardPageView {...controller} layout={layout} header={header} />;
};
