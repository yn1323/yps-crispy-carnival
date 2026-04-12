import { Badge, Flex, IconButton, Menu, Portal, Text } from "@chakra-ui/react";
import { LuEllipsisVertical, LuPencil, LuTrash2 } from "react-icons/lu";
import type { Staff } from "../types";

const MENU_POSITIONING = { placement: "bottom-end" } as const;

type Props = {
  staff: Staff;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
};

export const StaffListItem = ({ staff, onEdit, onDelete }: Props) => {
  return (
    <Flex
      align="center"
      justify="space-between"
      px={{ base: 4, lg: 5 }}
      py={3.5}
      _notLast={{ borderBottom: "1px solid", borderColor: "gray.200" }}
    >
      <Flex align="center" gap={4}>
        <Text
          fontWeight="500"
          fontSize="sm"
          w="160px"
          flexShrink={0}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {staff.name}
        </Text>
        <Text color="gray.500" fontSize="sm" display={{ base: "none", lg: "block" }}>
          {staff.email}
        </Text>
      </Flex>

      <Flex align="center" gap={2}>
        {staff.isOwner && (
          <Badge colorPalette="teal" variant="subtle" borderRadius="full" fontSize="xs" px={2.5}>
            オーナー
          </Badge>
        )}
        <Menu.Root positioning={MENU_POSITIONING}>
          <Menu.Trigger asChild>
            <IconButton aria-label="メニュー" variant="ghost" size="xs" color="fg.muted">
              <LuEllipsisVertical />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="140px">
                <Menu.Item value="edit" cursor="pointer" onClick={() => onEdit(staff)}>
                  <LuPencil />
                  編集
                </Menu.Item>
                <Menu.Item
                  value="delete"
                  color={staff.isOwner ? "fg.muted" : "fg.error"}
                  cursor={staff.isOwner ? "not-allowed" : "pointer"}
                  disabled={staff.isOwner}
                  // Chakra v3 Menu.Item は disabled でも onClick が発火するためガード
                  onClick={() => {
                    if (!staff.isOwner) onDelete(staff);
                  }}
                >
                  <LuTrash2 />
                  削除
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Flex>
    </Flex>
  );
};
