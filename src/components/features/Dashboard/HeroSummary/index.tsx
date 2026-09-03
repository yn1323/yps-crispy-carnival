import { Alert, Box, Heading, HStack, Link, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCircleCheck } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
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
  isCreateRecruitmentActionDisabled = false,
  createRecruitmentDisabledReason,
  announcementBanner,
  staffRegistrationRequest,
  notificationFailures,
  hideActionSection = false,
  isRecruitmentTaskAvailable = true,
  unavailableTaskSources = [],
}: Props) => {
  const action = isRecruitmentTaskAvailable ? pickNextAction(recruitments) : undefined;
  const hasActionItems =
    action !== undefined ||
    notificationFailures !== undefined ||
    staffRegistrationRequest !== undefined ||
    unavailableTaskSources.length > 0;

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
          {unavailableTaskSources.length > 0 && (
            <Alert.Root status="error" role="alert" alignItems="flex-start" borderRadius="lg">
              <Alert.Indicator />
              <Alert.Content gap={3}>
                <Stack gap={1}>
                  <Alert.Title>一部の要対応項目を読み込めませんでした</Alert.Title>
                  <Alert.Description>
                    取得できた要対応項目だけを表示しています。時間をおいて再試行してください。解消しない場合は、
                    <Link asChild color="teal.800" textDecoration="underline">
                      <MeasurementLink href="/contact">お問い合わせフォーム</MeasurementLink>
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
