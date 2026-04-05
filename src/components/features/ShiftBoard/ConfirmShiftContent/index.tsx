import { Box, Text } from "@chakra-ui/react";

type Props = {
  staffCount: number;
  periodLabel: string;
};

export const ConfirmShiftContent = ({ staffCount, periodLabel }: Props) => {
  return (
    <>
      <Text fontSize="sm" lineHeight="tall" mb={4}>
        全スタッフにメールでシフトが送信されます。
      </Text>
      <Box bg="gray.50" borderRadius="md" p={4}>
        <Text fontSize="sm">対象: {staffCount}名</Text>
        <Text fontSize="sm">期間: {periodLabel}</Text>
      </Box>
    </>
  );
};
