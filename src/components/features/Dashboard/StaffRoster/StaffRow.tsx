import { Badge, Flex, HStack, IconButton, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { LuEllipsisVertical, LuPencil, LuTrash2 } from "react-icons/lu";
import type { Staff } from "@/src/components/features/Dashboard/types";

type Props = {
  staff: Staff;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
};

export function StaffRow({ staff, onEdit, onDelete }: Props) {
  const initial = staff.name.trim().charAt(0) || "?";
  const avatarPalette = staff.isOwner ? { bg: "teal.500", fg: "white" } : { bg: "teal.50", fg: "teal.700" };

  return (
    <HStack
      gap={3}
      px={{ base: 3, lg: 4 }}
      py={3.5}
      align="center"
      bg={staff.isOwner ? "teal.50/50" : "transparent"}
      transition="background-color 150ms ease"
      _hover={{ bg: staff.isOwner ? "teal.50" : "blackAlpha.50" }}
    >
      <Flex
        boxSize="40px"
        borderRadius="full"
        bg={avatarPalette.bg}
        color={avatarPalette.fg}
        align="center"
        justify="center"
        fontWeight="semibold"
        fontSize="sm"
        flexShrink={0}
        letterSpacing="0.02em"
      >
        {initial}
      </Flex>
      <Stack gap={0} flex={1} minW={0}>
        <HStack gap={2} align="center">
          <Text fontWeight={500} color="gray.900" truncate>
            {staff.name}
          </Text>
          {staff.isOwner && (
            <Badge colorPalette="teal" variant="subtle" borderRadius="full" px={2} fontSize="10px">
              オーナー
            </Badge>
          )}
        </HStack>
        <Text fontSize="xs" color="fg.muted" display={{ base: "none", lg: "block" }} truncate>
          {staff.email}
        </Text>
      </Stack>
      <Menu.Root positioning={{ placement: "bottom-end" }}>
        <Menu.Trigger asChild>
          <IconButton aria-label="スタッフの操作メニュー" variant="ghost" size="sm" color="fg.muted">
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
    </HStack>
  );
}
