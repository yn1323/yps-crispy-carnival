import { Box, Button, Flex, Icon, IconButton, Text } from "@chakra-ui/react";
import { LuArrowLeft, LuCircleCheck } from "react-icons/lu";
import { formatDateTime } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";

type Props = {
  periodLabel: string;
  submittedCount: number;
  totalStaffCount: number;
  confirmedAt: Date | null;
  onBack: () => void;
  onSave: () => void;
  onConfirm: () => void;
  isSaving?: boolean;
};

export const ShiftBoardSPHeader = ({
  periodLabel,
  submittedCount,
  totalStaffCount,
  confirmedAt,
  onBack,
  onSave,
  onConfirm,
  isSaving = false,
}: Props) => {
  const isAllSubmitted = submittedCount >= totalStaffCount;
  const isConfirmed = confirmedAt !== null;

  return (
    <Box>
      <Flex align="center" gap={2} bg="white" px={4} py={3} borderBottom="1px solid" borderColor="gray.200">
        <IconButton aria-label="戻る" onClick={onBack} variant="ghost" size="sm">
          <LuArrowLeft />
        </IconButton>
        <Text fontSize="md" fontWeight="600" color="gray.900">
          シフト表
        </Text>
      </Flex>

      <Box bg="white" px={4} py={3} borderBottom="1px solid" borderColor="gray.200">
        <Text fontSize="sm" fontWeight="600" color="gray.900">
          {periodLabel}
        </Text>

        <Flex align="center" justify="space-between" mt={2}>
          <Text fontSize="xs" color={isAllSubmitted ? "green.600" : "gray.600"}>
            {isAllSubmitted
              ? `提出状況: ${submittedCount}/${totalStaffCount}人完了 ✓`
              : `提出状況: ${submittedCount}/${totalStaffCount}人完了`}
          </Text>

          <Flex align="center" gap={2}>
            <Button variant="outline" size="xs" onClick={onSave} loading={isSaving}>
              保存
            </Button>
            {isConfirmed ? (
              <Button variant="outline" size="xs" borderColor="teal.600" color="teal.600" onClick={onConfirm}>
                再送
              </Button>
            ) : (
              <Button size="xs" colorPalette="teal" onClick={onConfirm}>
                送る
              </Button>
            )}
          </Flex>
        </Flex>

        <Flex align="center" gap={1} mt={2} visibility={isConfirmed ? "visible" : "hidden"}>
          <Icon color="green.600" boxSize={3}>
            <LuCircleCheck />
          </Icon>
          <Text fontSize="xs" color="green.600">
            送付済み（{confirmedAt && formatDateTime(confirmedAt)}）
          </Text>
        </Flex>
      </Box>
    </Box>
  );
};
