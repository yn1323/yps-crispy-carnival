import { Box, Flex, Heading, HStack, Stack } from "@chakra-ui/react";
import type { PaginationStatus } from "convex/browser";
import { LuChevronDown, LuPlus, LuUsers } from "react-icons/lu";
import type { Staff } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DASHBOARD_TOUR_TARGET } from "../dashboardTourTargets";
import { StaffRow } from "./StaffRow";

type Props = {
  staffs: Staff[];
  status: PaginationStatus;
  canLoadMore: boolean;
  onAddClick: () => void;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
  onShowLineQr: (staff: Staff) => void;
  onSendLineInvite: (staff: Staff) => void;
  onLoadMore: () => void;
};

export const StaffRoster = ({
  staffs,
  status,
  canLoadMore,
  onAddClick,
  onEdit,
  onDelete,
  onShowLineQr,
  onSendLineInvite,
  onLoadMore,
}: Props) => {
  const showLoadMore = canLoadMore && status !== "LoadingFirstPage";
  const sorted = [...staffs].sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

  return (
    <Stack as="section" aria-label="スタッフ一覧" gap={{ base: 4, lg: 5 }}>
      <Flex justify="space-between" align="flex-end" gap={3} wrap="wrap">
        <Stack gap={1} minW={0}>
          <HStack gap={2.5} align="center">
            <Box color="fg.muted" fontSize={{ base: "xl", lg: "2xl" }}>
              <LuUsers />
            </Box>
            <Heading
              as="h2"
              fontSize={{ base: "lg", lg: "xl" }}
              lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
              fontWeight="bold"
              color="gray.900"
            >
              スタッフ一覧
            </Heading>
          </HStack>
        </Stack>
        <Flex gap={2} wrap="wrap">
          <Button
            data-tour={DASHBOARD_TOUR_TARGET.addStaff}
            variant="ghost"
            colorPalette="teal"
            size="sm"
            onClick={onAddClick}
            gap={1.5}
            fontWeight="semibold"
          >
            <LuPlus />
            スタッフを追加
          </Button>
        </Flex>
      </Flex>

      {sorted.length === 0 ? (
        <Empty
          icon={LuUsers}
          title="まだスタッフはいません"
          description="名前とメールアドレスだけでスタッフを登録できます。"
          tone="brand"
          variant="section"
        />
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
              <StaffRow
                key={s._id}
                staff={s}
                onEdit={onEdit}
                onDelete={onDelete}
                onShowLineQr={onShowLineQr}
                onSendLineInvite={onSendLineInvite}
              />
            ))}
          </Stack>
        </Box>
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
