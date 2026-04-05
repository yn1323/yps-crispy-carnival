import { Box, Text } from "@chakra-ui/react";

type Props = {
  periodLabel: string;
};

export const PeriodBar = ({ periodLabel }: Props) => {
  return (
    <Box px={4} py={3}>
      <Text fontSize="sm" fontWeight="semibold">
        {periodLabel} のシフト
      </Text>
    </Box>
  );
};
