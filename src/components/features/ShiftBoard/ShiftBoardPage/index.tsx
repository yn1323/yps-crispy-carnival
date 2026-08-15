import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftFormHeader } from "@/src/components/features/Shift/ShiftForm";
import type { ShiftBoardData } from "../types";
import { ShiftBoardPageView } from "./ShiftBoardPageView";
import { useShiftBoardPageController } from "./useShiftBoardPageController";

export type ShiftBoardPageProps = {
  data: ShiftBoardData;
  recruitmentId: Id<"recruitments">;
  layout?: "legacy" | "app";
  header?: ShiftFormHeader;
};

export const ShiftBoardPage = ({ data, recruitmentId, layout = "legacy", header }: ShiftBoardPageProps) => {
  const controller = useShiftBoardPageController(data, recruitmentId);

  return <ShiftBoardPageView {...controller} layout={layout} header={header} />;
};
