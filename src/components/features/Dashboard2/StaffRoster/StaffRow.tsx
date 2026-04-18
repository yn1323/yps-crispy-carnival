import { Badge, Flex, HStack, IconButton, Stack, Text } from "@chakra-ui/react";
import { LuEllipsisVertical } from "react-icons/lu";
import type { Staff } from "@/src/components/features/Dashboard/types";

type Props = {
  staff: Staff;
  onMenuClick: (staffId: string) => void;
};

export function StaffRow({ staff, onMenuClick }: Props) {
  const initial = getInitial(staff.name);
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
      <IconButton
        aria-label={`${staff.name}のメニュー`}
        variant="ghost"
        size="sm"
        color="fg.muted"
        onClick={() => onMenuClick(staff._id)}
      >
        <LuEllipsisVertical />
      </IconButton>
    </HStack>
  );
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0);
}
