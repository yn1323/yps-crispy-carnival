import { Flex, Spinner } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftBoardPage } from "@/src/components/features/ShiftBoard/ShiftBoardPage";
import { Animation } from "@/src/components/templates/Animation";
import { buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/_auth/shiftboard/$recruitmentId")({
  head: () => ({
    meta: buildMeta({ title: "シフト表", noindex: true }),
  }),
  component: ShiftBoardRoute,
});

function ShiftBoardRoute() {
  const { recruitmentId } = Route.useParams();
  const data = useQuery(api.shiftBoard.queries.getShiftBoardData, {
    recruitmentId: recruitmentId as Id<"recruitments">,
  });

  if (data === undefined) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner />
      </Flex>
    );
  }

  if (data === null) return null;

  return (
    <Animation>
      <ShiftBoardPage data={data} recruitmentId={recruitmentId as Id<"recruitments">} />
    </Animation>
  );
}
