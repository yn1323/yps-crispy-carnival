import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftFormHeader } from "@/src/components/features/Shift/ShiftForm";
import type { ShiftBoardData, ShiftBoardStaffingData } from "../types";
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
  /** 「くわしく」表示に使う店舗の設定。渡さない場合は、従来の画面だけを出す。 */
  staffing?: ShiftBoardStaffingData;
};

export const ShiftBoardPage = ({
  data,
  recruitmentId,
  layout = "legacy",
  header,
  onExport,
  dateNotes,
  staffing,
}: ShiftBoardPageProps) => {
  const controller = useShiftBoardPageController(data, recruitmentId, onExport, dateNotes, staffing);

  return <ShiftBoardPageView {...controller} layout={layout} header={header} />;
};
