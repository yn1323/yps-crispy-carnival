import { Badge, Flex, Text } from "@chakra-ui/react";
import type { Staff } from "../types";

type Props = {
  staff: Staff;
};

export const StaffListItem = ({ staff }: Props) => {
  return (
    <Flex
      align="center"
      justify="space-between"
      px={{ base: 4, lg: 5 }}
      py={3}
      _notLast={{ borderBottom: "1px solid", borderColor: "gray.200" }}
    >
      <Flex gap={{ base: 2, lg: 4 }} align="center" flex={1} minW={0}>
        <Text fontWeight="500" fontSize="sm" truncate>
          {staff.name}
        </Text>
        <Text color="gray.500" fontSize="sm" truncate hideBelow="lg">
          {staff.email}
        </Text>
      </Flex>
      <Badge colorPalette={staff.role === "admin" ? "teal" : "gray"} variant="subtle" flexShrink={0}>
        {staff.role === "admin" ? "管理者" : "スタッフ"}
      </Badge>
    </Flex>
  );
};
