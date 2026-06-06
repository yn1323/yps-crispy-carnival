import { Box } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { LuSend } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReissueFormValues } from "@/convex/staffAuth/schemas";
import { ReissueForm } from "@/src/components/features/StaffView/ReissueForm";
import { useRequestShiftReissue } from "@/src/components/features/StaffView/useRequestShiftReissue";
import { StaffLayout, StaffNarrowContent } from "@/src/components/templates/StaffLayout";
import { Empty } from "@/src/components/ui/Empty";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { showErrorToast } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";

type Props = {
  recruitmentId: string;
};

export function StaffShiftReissuePage({ recruitmentId }: Props) {
  const [isDone, setIsDone] = useState(false);

  const info = useQuery(api.staffAuth.queries.getRecruitmentInfo, {
    recruitmentId: recruitmentId as Id<"recruitments">,
  });
  const requestReissue = useRequestShiftReissue(recruitmentId);

  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(async (values: ReissueFormValues) => {
    try {
      await requestReissue(values);
      setIsDone(true);
    } catch (error) {
      showErrorToast(error);
    }
  });

  if (info === undefined) {
    return <FullPageSpinner />;
  }

  const shopName = info?.shopName ?? "シフト閲覧";

  return (
    <StaffLayout shopName={shopName}>
      {isDone ? (
        <StaffNarrowContent flex={1} display="flex" alignItems="center" justifyContent="center">
          <Empty
            icon={LuSend}
            title="新しい閲覧リンクを送りました"
            description={"LINE連携済みの方にはLINEに、\nそうでない方にはメールに\n新しい閲覧リンクを送りました。"}
            secondaryDescription={"届かない場合は\nシフト作成担当者に連絡してください。"}
            tone="brand"
          />
        </StaffNarrowContent>
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
