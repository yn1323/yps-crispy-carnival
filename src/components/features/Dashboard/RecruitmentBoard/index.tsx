import { Box, Flex, Heading, HStack, Skeleton, Stack } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import { LuCalendarDays, LuChevronDown, LuInbox, LuPlus } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DASHBOARD_TOUR_TARGET } from "../dashboardTourTargets";
import { RecruitmentRow } from "./RecruitmentRow";

type Props = {
  recruitments: Recruitment[];
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
  status,
  canLoadMore,
  tourRecruitmentId,
  onCreateClick,
  onOpenShiftBoard,
  onDeleteRecruitment,
  onLoadMore,
}: Props) => {
  const showLoadMore = canLoadMore && status !== "LoadingFirstPage";

  return (
    <Stack as="section" aria-label="シフト一覧" gap={{ base: 4, lg: 5 }}>
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
              シフト一覧
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

      {recruitments.length === 0 ? (
        <Empty
          icon={LuInbox}
          title="シフト一覧はまだありません"
          description="期間と締切を決めて、スタッフに希望を聞きましょう。"
          tone="brand"
          variant="section"
          action={
            <Button colorPalette="teal" size="md" onClick={onCreateClick} gap={1.5}>
              <LuPlus />
              はじめてのシフトを作成する
            </Button>
          }
        />
      ) : (
        <Stack gap={{ base: 3, lg: 3.5 }}>
          {recruitments.map((r) => (
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
  );
};

export const RecruitmentBoardSkeleton = () => (
  <Stack as="section" aria-label="シフト一覧を読み込み中" gap={{ base: 4, lg: 5 }}>
    <Flex justify="space-between" align="flex-end" gap={3} wrap="wrap">
      <HStack gap={2.5} align="center">
        <Skeleton boxSize={{ base: "24px", lg: "28px" }} borderRadius="full" />
        <Skeleton h={{ base: "28px", lg: "30px" }} w="112px" />
      </HStack>
      <Skeleton h="32px" w={{ base: "148px", md: "164px" }} />
    </Flex>

    <Stack gap={{ base: 3, lg: 3.5 }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <RecruitmentRowSkeleton key={index} />
      ))}
    </Stack>
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
