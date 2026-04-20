import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import { LuCalendarPlus, LuChevronDown, LuInbox } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { RecruitmentRow } from "./RecruitmentRow";

type Props = {
  recruitments: Recruitment[];
  status: PaginationStatus;
  onCreateClick: () => void;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onLoadMore: () => void;
};

export const RecruitmentBoard = ({ recruitments, status, onCreateClick, onOpenShiftBoard, onLoadMore }: Props) => {
  const canLoadMore = status !== "Exhausted" && status !== "LoadingFirstPage";

  return (
    <Stack gap={{ base: 4, lg: 5 }}>
      <Flex justify="space-between" align="flex-end" gap={3} wrap="wrap">
        <Stack gap={1} minW={0}>
          <Heading
            as="h2"
            fontSize={{ base: "xl", lg: "2xl" }}
            fontWeight="bold"
            letterSpacing="-0.01em"
            color="gray.900"
          >
            シフト募集
          </Heading>
          <Text fontSize="sm" color="fg.muted">
            募集の進み具合をまとめて確認できます。
          </Text>
        </Stack>
        <Button colorPalette="teal" size="sm" onClick={onCreateClick} gap={1.5} fontWeight="semibold">
          <LuCalendarPlus />
          新しい募集をつくる
        </Button>
      </Flex>

      {recruitments.length === 0 ? (
        <EmptyState />
      ) : (
        <Stack gap={{ base: 3, lg: 3.5 }}>
          {recruitments.map((r) => (
            <RecruitmentRow key={r._id} recruitment={r} onOpenShiftBoard={onOpenShiftBoard} />
          ))}
        </Stack>
      )}

      {canLoadMore && (
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

const EmptyState = () => (
  <Stack
    align="center"
    textAlign="center"
    gap={3}
    py={{ base: 10, lg: 12 }}
    px={6}
    borderRadius="xl"
    borderStyle="dashed"
    borderWidth="1.5px"
    borderColor="teal.100"
    bg="teal.50/50"
  >
    <Box color="teal.500" fontSize="32px">
      <LuInbox />
    </Box>
    <Stack gap={1}>
      <Text fontWeight="semibold" color="gray.800">
        まだ募集はありません
      </Text>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        期間を決めて最初の募集をつくりましょう。
      </Text>
    </Stack>
  </Stack>
);
