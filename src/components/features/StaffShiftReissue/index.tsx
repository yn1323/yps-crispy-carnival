import { Box } from "@chakra-ui/react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { LuSend } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReissueFormValues } from "@/convex/staffAuth/schemas";
import { showErrorToast } from "@/src/components/shared/feedback";
import { StaffNarrowContent } from "@/src/components/templates/StaffLayout";
import { Empty } from "@/src/components/ui/Empty";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { ReissueForm } from "./ReissueForm";

type Props = {
  recruitmentId: string;
};

export function StaffShiftReissue({ recruitmentId }: Props) {
  const [isDone, setIsDone] = useState(false);
  const requestReissue = useMutation(api.staffAuth.mutations.requestReissue);
  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(async (values: ReissueFormValues) => {
    try {
      await requestReissue({
        email: values.email,
        recruitmentId: recruitmentId as Id<"recruitments">,
      });
      setIsDone(true);
    } catch (error) {
      showErrorToast(error);
    }
  });

  if (isDone) {
    return (
      <StaffNarrowContent flex={1} display="flex" alignItems="center" justifyContent="center">
        <Empty
          icon={LuSend}
          title="再発行を受け付けました"
          description={
            "入力内容が登録情報と一致し、\n再発行できる場合は、LINEまたはメールへ\n新しい閲覧リンクを送ります。"
          }
          secondaryDescription={"届かない場合は\nシフト作成担当者に連絡してください。"}
          tone="brand"
        />
      </StaffNarrowContent>
    );
  }

  return (
    <StaffNarrowContent py={{ base: 4, lg: 6 }}>
      <Box as="h1" fontSize="md" fontWeight="semibold" mb={4}>
        シフト閲覧リンクの再発行
      </Box>
      <ReissueForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </StaffNarrowContent>
  );
}
