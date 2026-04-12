import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import { formatDateShort } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { getDisplayStatus, type Recruitment } from "../types";

type Props = {
  recruitment: Recruitment;
  onOpenShiftBoard: (recruitmentId: string) => void;
};

const displayStatusConfig = {
  collecting: { label: "収集中", colorPalette: "teal" },
  "past-deadline": { label: "締切済み（要調整）", colorPalette: "yellow" },
  confirmed: { label: "確定済み", colorPalette: "gray" },
} as const;

export const RecruitmentCard = ({ recruitment, onOpenShiftBoard }: Props) => {
  const { _id, periodStart, periodEnd, deadline, responseCount, totalStaffCount } = recruitment;
  const displayStatus = getDisplayStatus(recruitment);
  const { label, colorPalette } = displayStatusConfig[displayStatus];

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
              提出状況: {responseCount}/{totalStaffCount}人
            </Text>
            <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2.5} fontSize="xs">
              {label}
            </Badge>
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
};
