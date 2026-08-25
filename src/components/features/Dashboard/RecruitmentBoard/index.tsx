import { Box, Flex, Heading, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import { useId } from "react";
import { LuCalendarDays, LuChevronDown, LuInbox, LuPlus } from "react-icons/lu";
import type { DashboardRecruitmentGroup, Recruitment } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DASHBOARD_TOUR_TARGET } from "../dashboardTourTargets";
import { RecruitmentRow } from "./RecruitmentRow";

type Props = {
  title?: string;
  groups: DashboardRecruitmentGroup[];
  isReadOnly?: boolean;
  canCreateRecruitments?: boolean;
  createRecruitmentDisabledReason?: string;
  showRecruitmentMenus?: boolean;
  canDeleteRecruitments?: boolean;
  deleteRecruitmentDisabledReason?: string;
  emptyState?: {
    title: string;
    description: string;
    actionLabel: string;
  };
  pastStatus: PaginationStatus;
  hasPastRecruitments: boolean;
  isPastRecruitmentsVisible: boolean;
  canLoadMorePastRecruitments: boolean;
  tourRecruitmentId?: Recruitment["_id"];
  getRecruitmentShopName?: (recruitment: Recruitment) => string | undefined;
  onCreateClick: () => void;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onDeleteRecruitment: (recruitment: Recruitment) => void;
  onShowPastRecruitments: () => void;
  onLoadMorePastRecruitments: () => void;
};

export const RecruitmentBoard = ({
  title = "シフト一覧",
  groups,
  isReadOnly = false,
  canCreateRecruitments,
  createRecruitmentDisabledReason,
  showRecruitmentMenus,
  canDeleteRecruitments,
  deleteRecruitmentDisabledReason,
  emptyState,
  pastStatus,
  hasPastRecruitments,
  isPastRecruitmentsVisible,
  canLoadMorePastRecruitments,
  tourRecruitmentId,
  getRecruitmentShopName,
  onCreateClick,
  onOpenShiftBoard,
  onDeleteRecruitment,
  onShowPastRecruitments,
  onLoadMorePastRecruitments,
}: Props) => {
  const createDisabledReasonId = useId();
  const canCreate = canCreateRecruitments ?? !isReadOnly;
  const resolvedCreateDisabledReason = canCreate
    ? undefined
    : (createRecruitmentDisabledReason ??
      (isReadOnly ? "現在のアカウント状態では募集を作成できません" : "募集を作成できません"));
  const resolvedEmptyState = emptyState ?? {
    title: `${title}はまだありません`,
    description: "期間と締切を決めて、スタッフに希望を聞きましょう。",
    actionLabel: "はじめての募集をつくる",
  };
  const isPastFirstPageLoading = isPastRecruitmentsVisible && pastStatus === "LoadingFirstPage";
  const showPastEntryButton = hasPastRecruitments && (!isPastRecruitmentsVisible || isPastFirstPageLoading);
  const showPastMoreButton = isPastRecruitmentsVisible && canLoadMorePastRecruitments;
  const showPastButton = showPastEntryButton || showPastMoreButton;
  const pastButtonLabel = showPastEntryButton ? "過去のシフトを見る" : "もっと見る";
  const pastButtonLoading =
    isPastRecruitmentsVisible && (pastStatus === "LoadingFirstPage" || pastStatus === "LoadingMore");
  const hasRecruitments = groups.some((group) => group.recruitments.length > 0);
  const hasVisibleContent = hasRecruitments || showPastButton;

  return (
    <Stack as="section" aria-label={title} gap={{ base: 4, lg: 5 }}>
      <Flex justify="space-between" align="flex-end" gap={3} wrap="wrap">
        <Stack gap={1} minW={0}>
          <HStack gap={2.5} align="center">
            <Box color="fg.muted" fontSize={{ base: "xl", lg: "2xl" }}>
              <LuCalendarDays />
            </Box>
            <Heading
              as="h2"
              fontSize={{ base: "lg", lg: "xl" }}
              lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
              fontWeight="bold"
              color="gray.900"
            >
              {title}
            </Heading>
          </HStack>
        </Stack>
        <Stack gap={1} align={{ base: "flex-start", sm: "flex-end" }}>
          <Button
            data-tour={DASHBOARD_TOUR_TARGET.createRecruitment}
            variant="ghost"
            colorPalette="teal"
            size="sm"
            onClick={onCreateClick}
            disabled={!canCreate}
            title={resolvedCreateDisabledReason}
            aria-describedby={resolvedCreateDisabledReason ? createDisabledReasonId : undefined}
            gap={1.5}
            fontWeight="semibold"
          >
            <LuPlus />
            新しい募集をつくる
          </Button>
          {resolvedCreateDisabledReason && (
            <Text id={createDisabledReasonId} fontSize="xs" color="fg.muted" textAlign={{ base: "left", sm: "right" }}>
              {resolvedCreateDisabledReason}
            </Text>
          )}
        </Stack>
      </Flex>

      {!hasVisibleContent ? (
        <Empty
          icon={LuInbox}
          title={resolvedEmptyState.title}
          description={resolvedEmptyState.description}
          tone="brand"
          variant="section"
          action={
            <Button
              colorPalette="teal"
              size="md"
              onClick={onCreateClick}
              gap={1.5}
              disabled={!canCreate}
              title={resolvedCreateDisabledReason}
              aria-describedby={resolvedCreateDisabledReason ? createDisabledReasonId : undefined}
            >
              <LuPlus />
              {resolvedEmptyState.actionLabel}
            </Button>
          }
        />
      ) : (
        <Stack gap={{ base: 4, lg: 5 }}>
          {groups.map((group) => (
            <Stack key={group.key} as="section" aria-label={group.title} gap={{ base: 2.5, lg: 3 }}>
              <HStack gap={2} minH="24px">
                <Heading as="h3" fontSize="sm" fontWeight="bold" color={groupTitleColor(group.key)} lineHeight="short">
                  {group.title}
                </Heading>
                {shouldShowGroupCount(group) && (
                  <Box
                    as="span"
                    px={2}
                    py={0.5}
                    borderRadius="full"
                    bg="blackAlpha.50"
                    color="fg.muted"
                    fontSize="xs"
                    fontWeight="semibold"
                    lineHeight="short"
                  >
                    {group.totalCount}件
                  </Box>
                )}
              </HStack>
              <Stack gap={{ base: 2.5, lg: 3 }}>
                {group.recruitments.map((r) => (
                  <RecruitmentRow
                    key={r._id}
                    recruitment={r}
                    isReadOnly={isReadOnly}
                    showMenu={showRecruitmentMenus}
                    canDelete={canDeleteRecruitments}
                    deleteDisabledReason={deleteRecruitmentDisabledReason}
                    dataTour={r._id === tourRecruitmentId ? DASHBOARD_TOUR_TARGET.latestRecruitment : undefined}
                    shopName={getRecruitmentShopName?.(r)}
                    onOpenShiftBoard={onOpenShiftBoard}
                    onDeleteRecruitment={onDeleteRecruitment}
                  />
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}

      {showPastButton && (
        <Flex justify="center">
          <Button
            variant="ghost"
            colorPalette="teal"
            size="sm"
            onClick={showPastEntryButton ? onShowPastRecruitments : onLoadMorePastRecruitments}
            loading={pastButtonLoading}
            gap={1}
          >
            <LuChevronDown />
            {pastButtonLabel}
          </Button>
        </Flex>
      )}
    </Stack>
  );
};

function groupTitleColor(groupKey: DashboardRecruitmentGroup["key"]) {
  if (groupKey === "actionRequired") return "orange.700";
  if (groupKey === "current" || groupKey === "confirmed") return "blue.700";
  if (groupKey === "past") return "gray.700";
  return "green.700";
}

function shouldShowGroupCount(group: DashboardRecruitmentGroup) {
  return group.key !== "current" && group.key !== "past";
}

export const RecruitmentBoardSkeleton = () => (
  <Stack as="section" aria-label="シフト一覧を読み込み中" gap={{ base: 4, lg: 5 }}>
    <Flex justify="space-between" align="flex-end" gap={3} wrap="wrap">
      <HStack gap={2.5} align="center">
        <Skeleton boxSize={{ base: "20px", lg: "24px" }} borderRadius="full" />
        <Skeleton h={{ base: "28px", lg: "30px" }} w="112px" />
      </HStack>
      <Skeleton h="36px" w="176px" />
    </Flex>

    <Stack gap={{ base: 4, lg: 5 }}>
      <RecruitmentGroupSkeleton rows={2} tone="collecting" />
      <RecruitmentGroupSkeleton rows={1} tone="confirmed" />
    </Stack>
  </Stack>
);

const RecruitmentGroupSkeleton = ({ rows, tone }: { rows: number; tone: "confirmed" | "collecting" }) => (
  <Stack as="section" gap={{ base: 2.5, lg: 3 }}>
    <HStack gap={2} minH="24px">
      <Skeleton h="18px" w="64px" />
      <Skeleton h="20px" w="36px" borderRadius="full" />
    </HStack>
    <Stack gap={{ base: 2.5, lg: 3 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <RecruitmentRowSkeleton key={index} tone={tone} />
      ))}
    </Stack>
  </Stack>
);

const RecruitmentRowSkeleton = ({ tone }: { tone: "confirmed" | "collecting" }) => {
  return (
    <Flex
      align="stretch"
      bg="white"
      borderRadius="xl"
      overflow="hidden"
      borderWidth="1px"
      borderColor="blackAlpha.50"
      boxShadow="xs"
      w="full"
    >
      <Box w="4px" bg="white" flexShrink={0} />
      <Flex
        flex={1}
        minW={0}
        px={{ base: 3.5, lg: 4 }}
        py={{ base: 2.5, lg: 3 }}
        align="stretch"
        gap={{ base: 1.5, lg: 3 }}
      >
        <Flex
          flex={1}
          minW={0}
          direction={{ base: "column", lg: "row" }}
          align={{ base: "stretch", lg: "center" }}
          gap={{ base: 1.5, lg: 4 }}
        >
          <HStack gap={3} flexShrink={0} minW={{ lg: "140px" }}>
            <Skeleton h="22px" w={{ base: "116px", lg: "140px" }} />
          </HStack>
          <Flex
            flex={1}
            minW={0}
            direction={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
            justify={{ base: "flex-start", sm: "space-between", md: "flex-end" }}
            gap={{ base: 2, md: 4 }}
            wrap="nowrap"
          >
            <HStack minW={{ lg: "84px" }} flexShrink={0} gap={2} wrap="wrap">
              <Skeleton h="22px" w={tone === "confirmed" ? "68px" : "56px"} borderRadius="full" />
            </HStack>
            <HStack
              gap={{ base: 3, lg: 8 }}
              flex={{ base: "none", sm: 1 }}
              w={{ base: "full", sm: "auto" }}
              justify={{ base: "space-between", sm: "flex-end" }}
              align="center"
              minW={0}
              wrap="nowrap"
            >
              <Skeleton h="18px" w={{ base: "88px", lg: "96px" }} />
              <Skeleton h="18px" w="72px" flexShrink={0} />
            </HStack>
          </Flex>
        </Flex>
      </Flex>
      <Flex align="center" justify="center" pe={{ base: 2, lg: 3 }} flexShrink={0}>
        <Flex boxSize="44px" align="center" justify="center">
          <Skeleton h="20px" w="4px" borderRadius="full" />
        </Flex>
      </Flex>
    </Flex>
  );
};
