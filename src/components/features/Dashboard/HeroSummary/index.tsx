import { Box, Heading, HStack, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCircleCheck } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { ActionTaskList } from "./ActionTaskList";
import { pickNextAction } from "./pickNextAction";

export { HeroSummarySkeleton } from "./HeroSummarySkeleton";
export { WelcomeHero } from "./WelcomeHero";

type Props = {
  recruitments: Recruitment[];
  onOpenShiftBoard: (recruitmentId: string) => void;
  onCreateRecruitment: () => void;
  isCreateRecruitmentActionDisabled?: boolean;
  createRecruitmentDisabledReason?: string;
  announcementBanner?: ReactNode;
  staffRegistrationRequest?: {
    count: number;
    content: ReactNode;
  };
  notificationFailures?: {
    count: number;
    content: ReactNode;
  };
  hideActionSection?: boolean;
  isRecruitmentTaskAvailable?: boolean;
};

export const HeroSummary = ({
  recruitments,
  onOpenShiftBoard,
  onCreateRecruitment,
  isCreateRecruitmentActionDisabled = false,
  createRecruitmentDisabledReason,
  announcementBanner,
  staffRegistrationRequest,
  notificationFailures,
  hideActionSection = false,
  isRecruitmentTaskAvailable = true,
}: Props) => {
  const action = isRecruitmentTaskAvailable ? pickNextAction(recruitments) : undefined;
  const hasActionItems =
    action !== undefined || notificationFailures !== undefined || staffRegistrationRequest !== undefined;

  if (!announcementBanner && (hideActionSection || !hasActionItems)) return null;

  return (
    <Stack gap={{ base: 5, lg: 6 }}>
      {announcementBanner}

      {!hideActionSection && hasActionItems && (
        <Stack gap={{ base: 3, lg: 4 }}>
          <HStack gap={2.5} align="center">
            <Box fontSize={{ base: "xl", lg: "2xl" }} flexShrink={0}>
              <LuCircleCheck />
            </Box>
            <Heading as="h2" textStyle="sectionTitle" color="gray.900">
              要対応
            </Heading>
          </HStack>

          <ActionTaskList
            action={action}
            onOpenShiftBoard={onOpenShiftBoard}
            onCreateRecruitment={onCreateRecruitment}
            isCreateRecruitmentActionDisabled={isCreateRecruitmentActionDisabled}
            createRecruitmentDisabledReason={createRecruitmentDisabledReason}
            notificationTask={notificationFailures ?? null}
            staffRegistrationRequest={staffRegistrationRequest}
          />
        </Stack>
      )}
    </Stack>
  );
};
