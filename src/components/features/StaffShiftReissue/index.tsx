import { Box, Text } from "@chakra-ui/react";
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
  recruitmentId: Id<"recruitments">;
  periodLabel: string;
};

type ViewProps = {
  periodLabel: string;
  isDone: boolean;
  isSubmitting: boolean;
  onSubmit: (values: ReissueFormValues) => void | Promise<void>;
};

export function StaffShiftReissue({ recruitmentId, periodLabel }: Props) {
  const [isDone, setIsDone] = useState(false);
  const requestReissue = useMutation(api.staffAuth.mutations.requestReissue);
  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(async (values: ReissueFormValues) => {
    try {
      await requestReissue({
        email: values.email,
        recruitmentId,
      });
      setIsDone(true);
    } catch (error) {
      showErrorToast(error);
    }
  });

  return (
    <StaffShiftReissueView
      periodLabel={periodLabel}
      isDone={isDone}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}

export function StaffShiftReissueView({ periodLabel, isDone, isSubmitting, onSubmit }: ViewProps) {
  if (isDone) {
    return (
      <StaffNarrowContent flex={1} display="flex" alignItems="center" justifyContent="center">
        <Empty
          icon={LuSend}
          title="再発行を受け付けました"
          description={"新しい閲覧リンクをLINEまたはメールへ送ります。\nしばらくお待ちください。"}
          secondaryDescription="届かない場合は、シフト作成担当者に連絡してください。"
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
      <Text fontSize="sm" color="fg.muted" mb={4}>
        対象期間：{periodLabel}
      </Text>
      <ReissueForm onSubmit={onSubmit} isSubmitting={isSubmitting} />
    </StaffNarrowContent>
  );
}
