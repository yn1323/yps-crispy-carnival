import { Badge, Flex, HStack, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { LuEllipsisVertical, LuMail, LuPencil, LuQrCode, LuTrash2 } from "react-icons/lu";
import type { Staff } from "@/src/components/features/Dashboard/types";
import { IconButton } from "@/src/components/ui/Button";

type Props = {
  staff: Staff;
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
  onShowLineQr: (staff: Staff) => void;
  onSendLineInvite: (staff: Staff) => void;
};

export function StaffRow({ staff, onEdit, onDelete, onShowLineQr, onSendLineInvite }: Props) {
  const initial = staff.name.trim().charAt(0) || "?";
  const avatarPalette = staff.isOwner ? { bg: "teal.500", fg: "white" } : { bg: "teal.50", fg: "teal.700" };
  const isLineActive = staff.isLineLinked && staff.isLineFollowing;
  const hasEmail = staff.email.length > 0;
  const canShowLineQr = !isLineActive;
  const canSendLineInvite = hasEmail && !isLineActive;

  return (
    <HStack
      as="article"
      aria-label={`${staff.name}のスタッフ情報`}
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
        <HStack gap={2} align="center" wrap="wrap">
          <Text fontWeight={500} color="gray.900" truncate>
            {staff.name}
          </Text>
          {staff.isOwner && (
            <Badge colorPalette="teal" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
              オーナー
            </Badge>
          )}
          {isLineActive && (
            <Badge colorPalette="green" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
              LINE連携済み
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
            <Menu.Content minW="180px">
              <Menu.Item value="edit" cursor="pointer" onClick={() => onEdit(staff)}>
                <LuPencil />
                編集
              </Menu.Item>
              <Menu.Item
                value="line-qr"
                cursor={canShowLineQr ? "pointer" : "not-allowed"}
                color={canShowLineQr ? undefined : "fg.muted"}
                disabled={!canShowLineQr}
                onClick={() => {
                  if (canShowLineQr) onShowLineQr(staff);
                }}
              >
                <LuQrCode />
                LINE連携リンクを表示
              </Menu.Item>
              <Menu.Item
                value="line-invite"
                cursor={canSendLineInvite ? "pointer" : "not-allowed"}
                color={canSendLineInvite ? undefined : "fg.muted"}
                disabled={!canSendLineInvite}
                onClick={() => {
                  if (canSendLineInvite) onSendLineInvite(staff);
                }}
              >
                <LuMail />
                LINE連携リンクをメールで送る
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
