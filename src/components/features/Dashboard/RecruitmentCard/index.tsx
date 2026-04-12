import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import { formatDateShort } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { RecruitmentStatusBadge } from "../RecruitmentStatusBadge";
import { getDisplayStatus, type Recruitment } from "../types";

type Props = {
  recruitment: Recruitment;
  onOpenShiftBoard: (recruitmentId: string) => void;
};

export function RecruitmentCard({ recruitment, onOpenShiftBoard }: Props) {
  const { _id, periodStart, periodEnd, deadline, responseCount } = recruitment;
  const displayStatus = getDisplayStatus(recruitment);

  return (
    <Box border="1px solid" borderColor="gray.200" borderRadius="lg" p={{ base: 4, lg: 5 }}>
      <Stack gap={{ base: 2.5, lg: 3 }}>
        <Flex justify="space-between" align="center">
          <Text fontWeight="600" fontSize={{ base: "sm", lg: "md" }}>
            {formatDateShort(periodStart)}〜{formatDateShort(periodEnd)}
          </Text>
          <Text color="gray.600" fontSize="sm">
            締切: {formatDateShort(deadline)}
          </Text>
        </Flex>
        <Flex justify="space-between" align="center" flexWrap="wrap" gap={{ base: 2.5, lg: 0 }}>
          <Flex
            gap={3}
            align="center"
            justify={{ base: "space-between", lg: "start" }}
            width={{ base: "full", lg: "auto" }}
          >
            <Text color="gray.600" fontSize="sm" whiteSpace="nowrap">
              提出済み: {responseCount}人
            </Text>
            <RecruitmentStatusBadge status={displayStatus} />
          </Flex>
          <Button
            variant="outline"
            size="sm"
            gap={1.5}
            width={{ base: "full", lg: "auto" }}
            onClick={() => onOpenShiftBoard(_id)}
          >
            シフトを編集する
            <LuArrowRight />
          </Button>
        </Flex>
      </Stack>
    </Box>
  );
}
