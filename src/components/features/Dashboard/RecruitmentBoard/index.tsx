import { Box, Flex, Heading, HStack, Skeleton, Stack } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import { LuCalendarCheck, LuCalendarDays, LuChevronDown, LuInbox, LuPlus } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DASHBOARD_TOUR_TARGET } from "../dashboardTourTargets";
import { RecruitmentRow } from "./RecruitmentRow";

type Props = {
  recruitments: Recruitment[];
  currentRecruitments?: Recruitment[];
  status: PaginationStatus;
  canLoadMore: boolean;
  tourRecruitmentId?: Recruitment["_id"];
  onCreateClick: () => void;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onDeleteRecruitment: (recruitment: Recruitment) => void;
  onLoadMore: () => void;
};

export const RecruitmentBoard = ({
  recruitments,
  currentRecruitments = [],
  status,
  canLoadMore,
  tourRecruitmentId,
  onCreateClick,
  onOpenShiftBoard,
  onDeleteRecruitment,
  onLoadMore,
}: Props) => {
  const showLoadMore = canLoadMore && status !== "LoadingFirstPage";
  const currentRecruitmentIds = new Set(currentRecruitments.map((recruitment) => recruitment._id));
  const listRecruitments = recruitments.filter((recruitment) => !currentRecruitmentIds.has(recruitment._id));
  const hasCurrentRecruitments = currentRecruitments.length > 0;

  return (
    <Stack gap={{ base: 7, lg: 8 }}>
      {hasCurrentRecruitments && (
        <CurrentShiftSection
          recruitments={currentRecruitments}
          onOpenShiftBoard={onOpenShiftBoard}
          onDeleteRecruitment={onDeleteRecruitment}
        />
      )}

      <Stack as="section" aria-label="シフト募集" gap={{ base: 4, lg: 5 }}>
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
                シフト募集
              </Heading>
            </HStack>
          </Stack>
          <Button
            data-tour={DASHBOARD_TOUR_TARGET.createRecruitment}
            variant="ghost"
            colorPalette="teal"
            size="sm"
            onClick={onCreateClick}
            gap={1.5}
            fontWeight="semibold"
          >
            <LuPlus />
            新しい募集をつくる
          </Button>
        </Flex>

        {listRecruitments.length === 0 ? (
          <Empty
            icon={LuInbox}
            title={hasCurrentRecruitments ? "ほかのシフト募集はありません" : "シフト募集はまだありません"}
            description={
              hasCurrentRecruitments
                ? "現在のシフトは上に表示しています。"
                : "期間と締切を決めて、スタッフに希望を聞きましょう。"
            }
            tone="brand"
            variant="section"
            action={
              <Button colorPalette="teal" size="md" onClick={onCreateClick} gap={1.5}>
                <LuPlus />
                {hasCurrentRecruitments ? "新しい募集をつくる" : "はじめてのシフトを作成する"}
              </Button>
            }
          />
        ) : (
          <Stack gap={{ base: 3, lg: 3.5 }}>
            {listRecruitments.map((r) => (
              <RecruitmentRow
                key={r._id}
                recruitment={r}
                dataTour={r._id === tourRecruitmentId ? DASHBOARD_TOUR_TARGET.latestRecruitment : undefined}
                onOpenShiftBoard={onOpenShiftBoard}
                onDeleteRecruitment={onDeleteRecruitment}
              />
            ))}
          </Stack>
        )}

        {showLoadMore && (
          <Flex justify="center">
            <Button
              variant="ghost"
              colorPalette="teal"
              size="sm"
              onClick={onLoadMore}
              loading={status === "LoadingMore"}
              gap={1}
            >
              <LuChevronDown />
              もっと見る
            </Button>
          </Flex>
        )}
      </Stack>
    </Stack>
  );
};

const CurrentShiftSection = ({
  recruitments,
  onOpenShiftBoard,
  onDeleteRecruitment,
}: {
  recruitments: Recruitment[];
  onOpenShiftBoard: (recruitmentId: string) => void;
  onDeleteRecruitment: (recruitment: Recruitment) => void;
}) => (
  <Stack as="section" aria-label="現在のシフト" gap={{ base: 4, lg: 5 }}>
    <HStack gap={2.5} align="center">
      <Box color="fg.muted" fontSize={{ base: "xl", lg: "2xl" }}>
        <LuCalendarCheck />
      </Box>
      <Heading
        as="h2"
        fontSize={{ base: "lg", lg: "xl" }}
        lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
        fontWeight="bold"
        color="gray.900"
      >
        現在のシフト
      </Heading>
    </HStack>

    <Stack gap={{ base: 3, lg: 3.5 }}>
      {recruitments.map((recruitment) => (
        <RecruitmentRow
          key={recruitment._id}
          recruitment={recruitment}
          isCurrentSection
          onOpenShiftBoard={onOpenShiftBoard}
          onDeleteRecruitment={onDeleteRecruitment}
        />
      ))}
    </Stack>
  </Stack>
);

export const RecruitmentBoardSkeleton = () => (
  <Stack gap={{ base: 7, lg: 8 }}>
    <CurrentShiftSectionSkeleton />
    <Stack as="section" aria-label="シフト募集を読み込み中" gap={{ base: 4, lg: 5 }}>
      <Flex justify="space-between" align="flex-end" gap={3} wrap="wrap">
        <HStack gap={2.5} align="center">
          <Skeleton boxSize={{ base: "24px", lg: "28px" }} borderRadius="full" />
          <Skeleton h={{ base: "28px", lg: "30px" }} w="112px" />
        </HStack>
        <Skeleton h="32px" w={{ base: "148px", md: "164px" }} />
      </Flex>

      <Stack gap={{ base: 3, lg: 3.5 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <RecruitmentRowSkeleton key={index} />
        ))}
      </Stack>
    </Stack>
  </Stack>
);

const CurrentShiftSectionSkeleton = () => (
  <Stack as="section" aria-label="現在のシフトを読み込み中" gap={{ base: 4, lg: 5 }}>
    <HStack gap={2.5} align="center">
      <Skeleton boxSize={{ base: "24px", lg: "28px" }} borderRadius="full" />
      <Skeleton h={{ base: "28px", lg: "30px" }} w="136px" />
    </HStack>
    <RecruitmentRowSkeleton accent="blue.100" borderColor="blue.100" bg="blue.50/20" />
  </Stack>
);

const RecruitmentRowSkeleton = ({
  accent = "green.100",
  borderColor = "blackAlpha.50",
  bg = "white",
}: {
  accent?: string;
  borderColor?: string;
  bg?: string;
}) => (
  <Flex
    align="stretch"
    bg={bg}
    borderRadius="xl"
    overflow="hidden"
    borderWidth="1px"
    borderColor={borderColor}
    boxShadow="xs"
    w="full"
    minH={{ base: "88px", lg: "66px" }}
  >
    <Box w="4px" bg={accent} flexShrink={0} />
    <Flex flex={1} minW={0} px={{ base: 3.5, lg: 4 }} py={3} align="stretch" gap={{ base: 2, lg: 3 }}>
      <Flex
        flex={1}
        minW={0}
        direction={{ base: "column", lg: "row" }}
        align={{ base: "stretch", lg: "center" }}
        gap={{ base: 2, lg: 4 }}
      >
        <Skeleton h="22px" w={{ base: "152px", lg: "140px" }} flexShrink={0} />
        <HStack gap={{ base: 2, lg: 5 }} flex={1} minW={0} wrap={{ base: "wrap", lg: "nowrap" }}>
          <Skeleton h="24px" w="72px" borderRadius="full" flexShrink={0} />
          <Skeleton h="18px" w="120px" flexShrink={0} />
          <Skeleton h="18px" w="80px" flexShrink={0} />
        </HStack>
      </Flex>
    </Flex>
    <Flex align="center" justify="center" pe={{ base: 2, lg: 3 }} flexShrink={0}>
      <Skeleton boxSize="32px" borderRadius="md" />
    </Flex>
  </Flex>
);
