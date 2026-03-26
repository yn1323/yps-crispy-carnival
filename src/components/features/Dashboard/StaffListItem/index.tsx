import { Flex, Text } from "@chakra-ui/react";
import type { Staff } from "../types";

type Props = {
  staff: Staff;
};

export const StaffListItem = ({ staff }: Props) => {
  return (
    <Flex
      align="center"
      gap={4}
      px={{ base: 4, lg: 5 }}
      py={3.5}
      _notLast={{ borderBottom: "1px solid", borderColor: "gray.200" }}
    >
      <Text fontWeight="500" fontSize="sm">
        {staff.name}
      </Text>
      <Text color="gray.500" fontSize="sm">
        {staff.email}
      </Text>
    </Flex>
  );
};
