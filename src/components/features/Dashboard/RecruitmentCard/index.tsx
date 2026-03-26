import { Badge, Box, Flex, Stack, Text } from "@chakra-ui/react";
import type { Recruitment } from "../types";

type Props = {
  recruitment: Recruitment;
};

export const RecruitmentCard = ({ recruitment }: Props) => {
  const { period, deadline, status, responseCount, totalStaffCount } = recruitment;

  return (
    <Box border="1px solid" borderColor="gray.200" borderRadius="lg" p={{ base: 4, lg: 5 }}>
      <Stack gap={{ base: 2.5, lg: 3 }}>
        <Flex justify="space-between" align="center">
          <Text fontWeight="600" fontSize={{ base: "sm", lg: "md" }}>
            {period.start} 〜 {period.end}
          </Text>
          <Badge colorPalette={status === "open" ? "green" : "gray"} variant="subtle">
            {status === "open" ? "募集中" : "締切済"}
          </Badge>
        </Flex>
        <Flex gap={{ base: 4, lg: 6 }} fontSize="sm" color="gray.600">
          <Text>締切: {deadline}</Text>
          <Text>
            回答: {responseCount}/{totalStaffCount}名
          </Text>
        </Flex>
      </Stack>
    </Box>
  );
};
