import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftBoardPage } from "@/src/components/features/ShiftBoard/ShiftBoardPage";
import { Animation } from "@/src/components/templates/Animation";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

type Props = {
  recruitmentId: string;
};

export function ShiftBoardRoutePage({ recruitmentId }: Props) {
  const data = useQuery(api.shiftBoard.queries.getShiftBoardData, {
    recruitmentId: recruitmentId as Id<"recruitments">,
  });

  if (data === undefined) {
    return <ShiftoriLoading variant="section" minH="200px" />;
  }

  if (data === null) return null;

  return (
    <Animation>
      <ShiftBoardPage data={data} recruitmentId={recruitmentId as Id<"recruitments">} />
    </Animation>
  );
}
