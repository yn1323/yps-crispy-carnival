import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import { formatDateShort } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import type { Recruitment } from "../types";

type Props = {
  recruitment: Recruitment;
  onOpenShiftBoard: (recruitmentId: string) => void;
};

export const RecruitmentCard = ({ recruitment, onOpenShiftBoard }: Props) => {
  const { id, period, deadline, status, responseCount, totalStaffCount } = recruitment;

  return (
    <Box border="1px solid" borderColor="gray.200" borderRadius="lg" p={{ base: 4, lg: 5 }}>
      <Stack gap={{ base: 2.5, lg: 3 }}>
        <Flex justify="space-between" align="center">
          <Text fontWeight="600" fontSize={{ base: "sm", lg: "md" }}>
            {formatDateShort(period.start)}〜{formatDateShort(period.end)}
          </Text>
          <Text color="gray.600" fontSize="sm">
            締切: {formatDateShort(deadline)}
          </Text>
        </Flex>
        <Flex justify="space-between" align="center" flexWrap="wrap" gap={{ base: 2.5, lg: 0 }}>
          <Flex gap={3} align="center" width={{ base: "full", lg: "auto" }}>
            <Text color="gray.600" fontSize="sm" whiteSpace="nowrap">
              提出状況: {responseCount}/{totalStaffCount}人
            </Text>
            <Badge
              colorPalette={status === "open" ? "teal" : "gray"}
              variant={status === "open" ? "solid" : "subtle"}
              borderRadius="full"
              px={2.5}
              fontSize="xs"
            >
              {status === "open" ? "募集中" : "送付完了"}
            </Badge>
          </Flex>
          <Button
            variant="outline"
            size="sm"
            gap={1.5}
            width={{ base: "full", lg: "auto" }}
            onClick={() => onOpenShiftBoard(id)}
          >
            シフトボードを開く
            <LuArrowRight />
          </Button>
        </Flex>
      </Stack>
    </Box>
  );
};
