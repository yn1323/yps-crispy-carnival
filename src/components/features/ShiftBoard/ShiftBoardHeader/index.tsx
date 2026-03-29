import { Box, Button, Flex, Icon, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuChevronLeft, LuCircleCheck, LuSave } from "react-icons/lu";
import { formatDateTime } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";

type Props = {
  periodLabel: string;
  submittedCount: number;
  totalStaffCount: number;
  confirmedAt: Date | null;
  onSave: () => void;
  onConfirm: () => void;
  isSaving?: boolean;
};

export const ShiftBoardHeader = ({
  periodLabel,
  submittedCount,
  totalStaffCount,
  confirmedAt,
  onSave,
  onConfirm,
  isSaving = false,
}: Props) => {
  const isAllSubmitted = submittedCount >= totalStaffCount;
  const isConfirmed = confirmedAt !== null;

  return (
    <Box bg="white" borderBottom="1px solid" borderColor="gray.200">
      <Box maxW="1024px" mx="auto" px={4} py={4}>
        <Flex align="center" gap={1} mb={3}>
          <Icon color="teal.600" boxSize={4}>
            <LuChevronLeft />
          </Icon>
          <Link to="/dashboard">
            <Text fontSize="sm" color="teal.600">
              ダッシュボード
            </Text>
          </Link>
        </Flex>

        <Flex align="center" justify="space-between">
          <Box>
            <Text fontSize="xl" fontWeight="600" color="gray.900">
              {periodLabel}
            </Text>
            <Text fontSize="sm" color={isAllSubmitted ? "green.600" : "gray.600"}>
              {isAllSubmitted
                ? `提出状況: ${submittedCount}/${totalStaffCount}人完了 ✓`
                : `提出状況: ${submittedCount}/${totalStaffCount}人完了`}
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
    </Box>
  );
};
