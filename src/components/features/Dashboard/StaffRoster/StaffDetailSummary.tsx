import { Badge, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import type { Staff } from "../types";
import type { StaffLineStatus } from "./staffDetailPresentation";

type Props = {
  staff: Staff;
  lineStatus: StaffLineStatus;
};

export const StaffDetailSummary = ({ staff, lineStatus }: Props) => {
  const initial = staff.name.trim().charAt(0) || "?";

  return (
    <HStack gap={3} align="center">
      <Flex
        boxSize="48px"
        borderRadius="full"
        bg={staff.isManager ? "teal.500" : "teal.50"}
        color={staff.isManager ? "white" : "teal.700"}
        align="center"
        justify="center"
        fontWeight="semibold"
        flexShrink={0}
      >
        {initial}
      </Flex>
      <Stack gap={1} minW={0}>
        <HStack gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold" color="gray.900" truncate>
            {staff.name}
          </Text>
          {staff.isManager && (
            <Badge colorPalette="teal" variant="subtle" borderRadius="full" px={2}>
              管理者
            </Badge>
          )}
          <Badge colorPalette={lineStatus.colorPalette} variant="subtle" borderRadius="full" px={2}>
            {lineStatus.label}
          </Badge>
          <Badge colorPalette={staff.excludedFromShift ? "gray" : "green"} variant="subtle" borderRadius="full" px={2}>
            {staff.excludedFromShift ? "シフト対象外" : "シフト対象"}
          </Badge>
        </HStack>
        {staff.email && (
          <Text fontSize="sm" color="fg.muted" truncate>
            {staff.email}
          </Text>
        )}
      </Stack>
    </HStack>
  );
};
