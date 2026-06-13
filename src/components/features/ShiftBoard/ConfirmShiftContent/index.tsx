import { Box, Flex, Icon, Stack, Text } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import type { DisplayIssue } from "@/src/domains/shift/assignmentIssues";

type Props = {
  staffCount: number;
  periodLabel: string;
  warnings?: DisplayIssue[];
};

export const ConfirmShiftContent = ({ staffCount, periodLabel, warnings = [] }: Props) => {
  return (
    <>
      <Text fontSize="sm" lineHeight="tall" mb={4}>
        LINEで受け取る設定のスタッフにはLINEで、未設定のスタッフにはメールでシフトが届きます。
      </Text>
      <Box bg="gray.50" borderRadius="md" p={4}>
        <Text fontSize="sm">対象: {staffCount}名</Text>
        <Text fontSize="sm">期間: {periodLabel}</Text>
      </Box>
      {warnings.length > 0 && (
        // 確認事項（希望との食い違いなど）。確定はできるが、念のため知らせる
        <Box mt={4} bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="md" p={4}>
          <Flex align="center" gap={2} mb={2}>
            <Icon color="orange.600" boxSize={4}>
              <LuTriangleAlert />
            </Icon>
            <Text fontSize="sm" fontWeight={700} color="orange.700">
              確認事項が{warnings.length}件あります
            </Text>
          </Flex>
          <Stack gap={1} maxH="120px" overflowY="auto">
            {warnings.map((warning) => (
              <Text key={warning.key} fontSize="xs" color="orange.700">
                {warning.label}
              </Text>
            ))}
          </Stack>
          <Text mt={2} fontSize="xs" color="fg.muted">
            問題なければこのまま確定できます。
          </Text>
        </Box>
      )}
    </>
  );
};
