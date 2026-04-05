import { Box } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReissueFormValues } from "@/convex/staffAuth/schemas";
import { ReissueDone } from "@/src/components/features/StaffView/ReissueDone";
import { ReissueForm } from "@/src/components/features/StaffView/ReissueForm";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";

export const Route = createFileRoute("/_unregistered/shifts/reissue")({
  validateSearch: (search: Record<string, unknown>) => ({
    recruitmentId: search.recruitmentId as string,
  }),
  component: ReissueRoute,
});

function ReissueRoute() {
  const { recruitmentId } = Route.useSearch();
  const [isDone, setIsDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const info = useQuery(api.staffAuth.queries.getRecruitmentInfo, {
    recruitmentId: recruitmentId as Id<"recruitments">,
  });
  const requestReissue = useMutation(api.staffAuth.mutations.requestReissue);

  const handleSubmit = async (values: ReissueFormValues) => {
    setIsSubmitting(true);
    try {
      await requestReissue({
        email: values.email,
        recruitmentId: recruitmentId as Id<"recruitments">,
      });
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
      <Box px={{ base: 4, lg: 6 }} py={3}>
        <Box fontSize="md" fontWeight="semibold">
          シフト閲覧リンクの再発行
        </Box>
      </Box>

      {isDone ? (
        <ReissueDone />
      ) : (
        <Box px={{ base: 4, lg: 6 }} maxW="480px" mx={{ lg: "auto" }}>
          <ReissueForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </Box>
      )}
    </StaffLayout>
  );
}
