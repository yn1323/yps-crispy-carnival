import { Box, Flex, Heading, HStack, Stack } from "@chakra-ui/react";
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

      {recruitments.length === 0 ? (
        <Empty
          icon={LuInbox}
          title="シフト募集はまだありません"
          description="期間と締切を決めて、スタッフに希望を聞きましょう。"
          tone="brand"
          variant="section"
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
