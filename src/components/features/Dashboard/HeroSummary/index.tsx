import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCircleCheck } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { ActionTaskList } from "./ActionTaskList";
import { pickNextAction } from "./pickNextAction";

export { HeroSummarySkeleton } from "./HeroSummarySkeleton";
export { WelcomeHero } from "./WelcomeHero";

type Shop = {
  name: string;
};

type Props = {
  shop: Shop;
  recruitments: Recruitment[];
  isReadOnly?: boolean;
  onEditClick: () => void;
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
  shop,
  recruitments,
  isReadOnly = false,
  onEditClick,
  onOpenShiftBoard,
  onCreateRecruitment,
  announcementBanner,
  staffRegistrationRequest,
  hasNotificationFailures = false,
  onNotificationFailuresClick,
  hideActionSection = false,
}: Props) => {
  const action = pickNextAction(recruitments);

  return (
    <Stack gap={{ base: 5, lg: 6 }}>
      <Stack gap={3} pb={{ base: 4, lg: 6 }} borderBottomWidth="1px" borderColor="gray.200">
        <Text display={{ base: "none", md: "block" }} fontSize="sm" fontWeight="semibold" color="fg.muted">
          店舗
        </Text>

        <Flex align="center" justify="space-between" direction="row" gap={4} minW={0}>
          <HStack gap={4} align="center" flex={1} minW={0}>
            <Heading as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900" truncate minW={0}>
              {shop.name}
            </Heading>
          </HStack>

          <Button
            aria-label="店舗設定を編集"
            variant="ghost"
            size="sm"
            colorPalette="teal"
            px={{ base: 0, md: 2 }}
            minW="auto"
            fontWeight="semibold"
            flexShrink={0}
            onClick={onEditClick}
            disabled={isReadOnly}
            title={isReadOnly ? "閲覧のみの店舗では設定を変更できません" : undefined}
          >
            編集
          </Button>
        </Flex>
      </Stack>

      {announcementBanner}

      {!hideActionSection && (
        <Stack gap={{ base: 3, lg: 4 }}>
          <HStack gap={2.5} align="center">
            <Box fontSize={{ base: "xl", lg: "2xl" }} flexShrink={0}>
              <LuCircleCheck />
            </Box>
            <Heading as="h2" textStyle="sectionTitle" color="gray.900">
              TODO
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
