import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftBoardPage } from "@/src/components/features/ShiftBoard/ShiftBoardPage";
import { Animation } from "@/src/components/templates/Animation";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";

type Props = {
  recruitmentId: string;
};

export function ShiftBoardRoutePage({ recruitmentId }: Props) {
  const data = useQuery(api.shiftBoard.queries.getShiftBoardData, {
    recruitmentId: recruitmentId as Id<"recruitments">,
  });

  if (data === undefined) {
    return (
      <ShiftoriLoading
        variant="section"
        minH={{
          base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
          md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
        }}
      />
    );
  }

  if (data === null) return null;

  return (
    <Animation>
      <ShiftBoardPage data={data} recruitmentId={recruitmentId as Id<"recruitments">} />
    </Animation>
  );
}
