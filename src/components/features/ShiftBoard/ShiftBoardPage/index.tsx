import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftBoardData } from "../types";
import { ShiftBoardPageView } from "./ShiftBoardPageView";
import { useShiftBoardPageController } from "./useShiftBoardPageController";

export type ShiftBoardPageProps = {
  data: ShiftBoardData;
  recruitmentId: Id<"recruitments">;
};

export const ShiftBoardPage = ({ data, recruitmentId }: ShiftBoardPageProps) => {
  const controller = useShiftBoardPageController(data, recruitmentId);

  return <ShiftBoardPageView {...controller} />;
};
