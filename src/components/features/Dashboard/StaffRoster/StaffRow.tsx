import { Badge, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { LuChevronRight } from "react-icons/lu";
import type { Staff } from "@/src/components/features/Dashboard/types";

type Props = {
  staff: Staff;
  onOpenDetail: (staff: Staff) => void;
};

export function StaffRow({ staff, onOpenDetail }: Props) {
  const initial = staff.name.trim().charAt(0) || "?";
  const avatarPalette = staff.isManager ? { bg: "teal.500", fg: "white" } : { bg: "teal.50", fg: "teal.700" };
  const isLineActive = staff.isLineLinked && staff.isLineFollowing;
  const isExcluded = staff.excludedFromShift;
  const hasUserDetail = Boolean(staff.organizationPersonId);

  return (
    <HStack
      as="button"
      id={staff.organizationPersonId ? `dashboard-user-${staff.organizationPersonId}` : undefined}
      aria-label={hasUserDetail ? `${staff.name}のユーザー詳細を開く` : `${staff.name}のスタッフ詳細を開く`}
      gap={3}
      px={{ base: 3, lg: 4 }}
      py={3.5}
      align="center"
      w="full"
      textAlign="left"
      bg={staff.isManager ? "teal.50/50" : "transparent"}
      borderWidth={0}
      cursor="pointer"
      transition="background-color 150ms ease"
      _hover={{ bg: staff.isManager ? "teal.50" : "blackAlpha.50" }}
      _focusVisible={{ outlineWidth: "2px", outlineStyle: "solid", outlineColor: "teal.500", outlineOffset: "-2px" }}
      onClick={() => onOpenDetail(staff)}
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
          {staff.isManager && (
            <Badge colorPalette="teal" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
              管理者
            </Badge>
          )}
          {isLineActive && (
            <Badge colorPalette="green" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
              LINE連携済み
            </Badge>
          )}
          {isExcluded && (
            <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
              シフト対象外
            </Badge>
          )}
        </HStack>
        <Text fontSize="xs" color="fg.muted" display={{ base: "none", lg: "block" }} truncate>
          {staff.email}
        </Text>
      </Stack>
      <Flex color="fg.muted" fontSize="lg" flexShrink={0} aria-hidden>
        <LuChevronRight />
      </Flex>
    </HStack>
  );
}
