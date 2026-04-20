import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import { LuChevronDown, LuUserPlus, LuUsers } from "react-icons/lu";
import type { Staff } from "@/src/components/features/Dashboard/types";
import { StaffRow } from "./StaffRow";

type Props = {
  staffs: Staff[];
  status: PaginationStatus;
  onAddClick: () => void;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
  onLoadMore: () => void;
};

export const StaffRoster = ({ staffs, status, onAddClick, onEdit, onDelete, onLoadMore }: Props) => {
  const canLoadMore = status !== "Exhausted" && status !== "LoadingFirstPage";
  const sorted = [...staffs].sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

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
            スタッフ
          </Heading>
          <Text fontSize="sm" color="fg.muted">
            シフトを組むメンバーです。
          </Text>
        </Stack>
        <Button colorPalette="teal" size="sm" onClick={onAddClick} gap={1.5} fontWeight="semibold">
          <LuUserPlus />
          スタッフを追加
        </Button>
      </Flex>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <Box
          bg="white"
          borderRadius="xl"
          borderWidth="1px"
          borderColor="blackAlpha.50"
          boxShadow="xs"
          overflow="hidden"
        >
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.50">
            {sorted.map((s) => (
              <StaffRow key={s._id} staff={s} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </Stack>
        </Box>
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
      <LuUsers />
    </Box>
    <Stack gap={1}>
      <Text fontWeight="semibold" color="gray.800">
        まだスタッフはいません
      </Text>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        名前とメールアドレスでスタッフを登録できます
      </Text>
    </Stack>
  </Stack>
);
