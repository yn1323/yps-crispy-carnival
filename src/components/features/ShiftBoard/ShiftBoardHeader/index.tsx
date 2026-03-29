import { Box, Button, Flex, Icon, Text } from "@chakra-ui/react";
import { LuCircleCheck, LuSave } from "react-icons/lu";
import { formatDateTime } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { formatSubmissionStatus, type ShiftBoardHeaderProps } from "../types";

export const ShiftBoardHeader = ({
  periodLabel,
  submittedCount,
  totalStaffCount,
  confirmedAt,
  onSave,
  onConfirm,
  isSaving = false,
}: ShiftBoardHeaderProps) => {
  const isAllSubmitted = submittedCount >= totalStaffCount;
  const isConfirmed = confirmedAt !== null;

  return (
    <Box bg="white" borderBottom="1px solid" borderColor="gray.200" px={4} py={4}>
      <Flex align="center" justify="space-between">
        <Box>
          <Text fontSize="xl" fontWeight="600" color="gray.900">
            {periodLabel}
          </Text>
          <Text fontSize="sm" color={isAllSubmitted ? "green.600" : "gray.600"}>
            {formatSubmissionStatus(submittedCount, totalStaffCount)}
          </Text>
        </Box>

        <Flex align="flex-end" direction="column" gap={1.5}>
          <Flex align="center" gap={2}>
            <Button variant="outline" size="sm" onClick={onSave} loading={isSaving}>
              <LuSave />
              保存
            </Button>
            {isConfirmed ? (
              <Button variant="outline" size="sm" borderColor="teal.600" color="teal.600" onClick={onConfirm}>
                再送する
              </Button>
            ) : (
              <Button size="sm" colorPalette="teal" onClick={onConfirm}>
                シフトを送る
              </Button>
            )}
          </Flex>
          <Flex align="center" gap={1} visibility={isConfirmed ? "visible" : "hidden"}>
            <Icon color="green.600" boxSize={3.5}>
              <LuCircleCheck />
            </Icon>
            <Text fontSize="xs" color="green.600">
              送付済み（{confirmedAt && formatDateTime(confirmedAt)}）
            </Text>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  );
};
