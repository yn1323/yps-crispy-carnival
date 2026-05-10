import { Box } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReissueFormValues } from "@/convex/staffAuth/schemas";
import { ReissueDone } from "@/src/components/features/StaffView/ReissueDone";
import { ReissueForm } from "@/src/components/features/StaffView/ReissueForm";
import { useRequestShiftReissue } from "@/src/components/features/StaffView/useRequestShiftReissue";
import { StaffLayout, StaffNarrowContent } from "@/src/components/templates/StaffLayout";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";

type Props = {
  recruitmentId: string;
};

export function StaffShiftReissuePage({ recruitmentId }: Props) {
  const [isDone, setIsDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const info = useQuery(api.staffAuth.queries.getRecruitmentInfo, {
    recruitmentId: recruitmentId as Id<"recruitments">,
  });
  const requestReissue = useRequestShiftReissue(recruitmentId);

  const handleSubmit = async (values: ReissueFormValues) => {
    setIsSubmitting(true);
    try {
      await requestReissue(values);
      setIsDone(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (info === undefined) {
    return <FullPageSpinner />;
  }

  const shopName = info?.shopName ?? "シフト閲覧";

  return (
    <StaffLayout shopName={shopName}>
      {isDone ? (
        <ReissueDone />
      ) : (
        <StaffNarrowContent py={{ base: 4, lg: 6 }}>
          <Box as="h1" fontSize="md" fontWeight="semibold" mb={4}>
            シフト閲覧リンクの再発行
          </Box>
          <ReissueForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </StaffNarrowContent>
      )}
    </StaffLayout>
  );
}
