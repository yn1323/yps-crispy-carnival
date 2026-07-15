import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffShiftReissue } from "@/src/components/features/StaffShiftReissue";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { StaffLayout } from "@/src/components/templates/StaffLayout";

type Props = {
  recruitmentId: string;
};

export function StaffShiftReissuePage({ recruitmentId }: Props) {
  const info = useQuery(api.staffAuth.queries.getRecruitmentInfo, {
    recruitmentId: recruitmentId as Id<"recruitments">,
  });

  if (info === undefined) {
    return <FullPageSpinner />;
  }

  const shopName = info?.shopName ?? "シフト閲覧";

  return (
    <StaffLayout shopName={shopName}>
      <StaffShiftReissue recruitmentId={recruitmentId} />
    </StaffLayout>
  );
}
