import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { LuChevronsDown, LuEllipsisVertical, LuUserPlus, LuUsers } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import { InfoGuide } from "@/src/components/ui/InfoGuide";
import { LoadMoreButton } from "../LoadMoreButton";
import { StaffListItem } from "../StaffListItem";
import type { PaginationStatus, Staff } from "../types";

type Props = {
  staffs: Staff[];
  onAddClick: () => void;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
  status: PaginationStatus;
  onLoadMore: () => void;
};

export function StaffSection({ staffs, onAddClick, onEdit, onDelete, status, onLoadMore }: Props) {
  const sortedStaffs = [...staffs].sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center">
        <Flex align="center" gap={0.5}>
          <Heading size={{ base: "md", lg: "lg" }}>スタッフ</Heading>
          <InfoGuide
            title="スタッフについて"
            pages={[
              <Stack key="1" gap={3}>
                <Text fontSize="sm">シフト希望を出してもらうメンバーを管理します</Text>
                <Flex align="center" gap={2}>
                  <Button size="sm" colorPalette="teal" pointerEvents="none">
                    <LuUserPlus />
                    スタッフを追加
                  </Button>
                </Flex>
                <Stack gap={0.5}>
                  <Text fontSize="xs" color="fg.muted">
                    スタッフ側のアカウント登録は不要です
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    このメールアドレスにシフト希望の依頼が届きます
                  </Text>
                </Stack>
              </Stack>,
              <Stack key="2" gap={3}>
                <Text fontSize="sm">登録したスタッフの編集・削除ができます</Text>
                <Flex align="center" gap={2} color="fg.muted">
                  <LuEllipsisVertical />
                  <Text fontSize="xs">← このメニューから操作できます</Text>
                </Flex>
              </Stack>,
            ]}
          />
        </Flex>
        <Button size="sm" colorPalette="teal" onClick={onAddClick}>
          <LuUserPlus />
          スタッフを追加
        </Button>
      </Flex>
      {sortedStaffs.length === 0 ? (
        <Box border="1px solid" borderColor="gray.200" borderRadius="lg">
          <Empty
            icon={LuUsers}
            title="スタッフが登録されていません"
            description="スタッフを追加して、シフト管理を始めましょう"
            minH="160px"
          />
        </Box>
      ) : (
        <Stack gap={3}>
          <Box border="1px solid" borderColor="gray.200" borderRadius="lg" overflow="hidden">
            {sortedStaffs.map((staff) => (
              <StaffListItem key={staff._id} staff={staff} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </Box>
          <LoadMoreButton status={status} onLoadMore={onLoadMore} icon={<LuChevronsDown />} label="すべて表示" />
        </Stack>
      )}
    </Stack>
  );
}
