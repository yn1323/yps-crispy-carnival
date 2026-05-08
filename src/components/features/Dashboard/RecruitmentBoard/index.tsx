import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import { LuCalendarDays, LuChevronDown, LuInbox, LuPlus } from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { RecruitmentRow } from "./RecruitmentRow";

type Props = {
  recruitments: Recruitment[];
  status: PaginationStatus;
  canLoadMore: boolean;
  onCreateClick: () => void;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onLoadMore: () => void;
};

export const RecruitmentBoard = ({
  recruitments,
  status,
  canLoadMore,
  onCreateClick,
  onOpenShiftBoard,
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
        <Button variant="ghost" colorPalette="teal" size="sm" onClick={onCreateClick} gap={1.5} fontWeight="semibold">
          <LuPlus />
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
    <Box color="teal.500" fontSize="3xl">
      <LuInbox />
    </Box>
    <Stack gap={1}>
      <Text fontWeight="semibold" color="gray.800">
        シフト募集はまだありません
      </Text>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        期間と締切を決めて、スタッフに希望を聞きましょう。
      </Text>
    </Stack>
  </Stack>
);
