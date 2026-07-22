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
  announcementBanner?: ReactNode;
  staffRegistrationRequest?: {
    count: number;
    onClick: () => void;
  };
  hasNotificationFailures?: boolean;
  onNotificationFailuresClick?: () => void;
  hideActionSection?: boolean;
};

export const HeroSummary = ({
  recruitments,
  onOpenShiftBoard,
  onCreateRecruitment,
  announcementBanner,
  staffRegistrationRequest,
  hasNotificationFailures = false,
  onNotificationFailuresClick,
  hideActionSection = false,
}: Props) => {
  const action = pickNextAction(recruitments);

  if (!announcementBanner && hideActionSection) return null;

  return (
    <Stack gap={{ base: 5, lg: 6 }}>
      {announcementBanner}

      {!hideActionSection && (
        <Stack gap={{ base: 3, lg: 4 }}>
          <HStack gap={2.5} align="center">
            <Box fontSize={{ base: "xl", lg: "2xl" }} flexShrink={0}>
              <LuCircleCheck />
            </Box>
            <Heading as="h2" textStyle="sectionTitle" color="gray.900">
              今やること
            </Heading>
          </HStack>

          <ActionTaskList
            action={action}
            onOpenShiftBoard={onOpenShiftBoard}
            onCreateRecruitment={onCreateRecruitment}
            notificationTask={
              hasNotificationFailures && onNotificationFailuresClick ? { onClick: onNotificationFailuresClick } : null
            }
            staffRegistrationRequest={staffRegistrationRequest}
          />
        </Stack>
      )}
    </Stack>
  );
};
