import { Alert, Box, Heading, HStack, Link, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCircleCheck } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { MeasurementBoundaryLink } from "@/src/components/shared/MeasurementBoundaryLink";
import { Button } from "@/src/components/ui/Button";
import { ActionTaskList } from "./ActionTaskList";
import { pickNextAction } from "./pickNextAction";

const reloadPage = () => window.location.reload();

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
  isRecruitmentTaskAvailable?: boolean;
  unavailableTaskSources?: {
    key: string;
    label: string;
    onRetry: () => void;
  }[];
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
  isRecruitmentTaskAvailable = true,
  unavailableTaskSources = [],
}: Props) => {
  const action = isRecruitmentTaskAvailable ? pickNextAction(recruitments) : undefined;

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
          {unavailableTaskSources.length > 0 && (
            <Alert.Root status="error" role="alert" alignItems="flex-start" borderRadius="lg">
              <Alert.Indicator />
              <Alert.Content gap={3}>
                <Stack gap={1}>
                  <Alert.Title>一部のTODOを読み込めませんでした</Alert.Title>
                  <Alert.Description>
                    取得できたTODOだけを表示しています。時間をおいて再試行してください。解消しない場合は、
                    <Link asChild color="teal.800" textDecoration="underline">
                      <MeasurementBoundaryLink href="/contact">お問い合わせフォーム</MeasurementBoundaryLink>
                    </Link>
                    からご連絡ください。
                  </Alert.Description>
                </Stack>
                <HStack gap={2} wrap="wrap">
                  {unavailableTaskSources.map((source) => (
                    <Button key={source.key} size="sm" colorPalette="gray" variant="outline" onClick={source.onRetry}>
                      {source.label}を再試行
                    </Button>
                  ))}
                  <Button size="sm" colorPalette="gray" variant="outline" onClick={reloadPage}>
                    ページを再読み込みする
                  </Button>
                </HStack>
              </Alert.Content>
            </Alert.Root>
          )}
        </Stack>
      )}
    </Stack>
  );
};
