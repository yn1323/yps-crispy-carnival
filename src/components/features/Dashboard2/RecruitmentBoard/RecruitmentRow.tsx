import { Badge, Box, Button, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { LuArrowRight, LuCalendarClock } from "react-icons/lu";
import {
  getDisplayStatus,
  type Recruitment,
  type RecruitmentDisplayStatus,
} from "@/src/components/features/Dashboard/types";
import { formatDateShort } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";

type Props = {
  recruitment: Recruitment;
  onOpenShiftBoard: (recruitmentId: string) => void;
};

const statusConfig: Record<
  RecruitmentDisplayStatus,
  { label: string; colorPalette: "teal" | "yellow" | "gray"; accent: string }
> = {
  collecting: { label: "収集中", colorPalette: "teal", accent: "teal.400" },
  "past-deadline": { label: "締切済み", colorPalette: "yellow", accent: "yellow.400" },
  confirmed: { label: "確定済み", colorPalette: "gray", accent: "gray.400" },
};

export function RecruitmentRow({ recruitment, onOpenShiftBoard }: Props) {
  const { _id, periodStart, periodEnd, deadline, responseCount } = recruitment;
  const displayStatus = getDisplayStatus(recruitment);
  const { label, colorPalette, accent } = statusConfig[displayStatus];
  const relativeText = relativeDeadline(deadline, displayStatus);

  return (
    <Flex
      align="stretch"
      gap={0}
      bg="white"
      borderRadius="xl"
      overflow="hidden"
      borderWidth="1px"
      borderColor="blackAlpha.50"
      boxShadow="xs"
      transition="transform 180ms ease, box-shadow 180ms ease"
      _hover={{ boxShadow: "sm", transform: "translateY(-1px)" }}
    >
      <Box w="4px" bg={accent} flexShrink={0} />
      <Stack flex={1} minW={0} gap={{ base: 3.5, lg: 4 }} p={{ base: 4, lg: 5 }}>
        <Flex justify="space-between" align="flex-start" gap={4}>
          <Stack gap={2} minW={0}>
            <Text fontSize={{ base: "md", lg: "lg" }} fontWeight="semibold" color="gray.900" lineHeight="short">
              {formatDateShort(periodStart)} 〜 {formatDateShort(periodEnd)}
            </Text>
            <HStack gap={2} wrap="wrap">
              <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2.5} fontSize="xs">
                {label}
              </Badge>
              <HStack gap={1} color="fg.muted" fontSize="xs">
                <LuCalendarClock />
                <Text>{relativeText}</Text>
              </HStack>
            </HStack>
          </Stack>
          <Stack gap={0.5} align="flex-end" flexShrink={0}>
            <HStack gap={0.5} align="baseline">
              <Text fontSize={{ base: "2xl", lg: "3xl" }} fontWeight="bold" color="teal.700" lineHeight="1">
                {responseCount}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                人
              </Text>
            </HStack>
            <Text fontSize="11px" color="fg.muted" lineHeight="1">
              提出ずみ
            </Text>
          </Stack>
        </Flex>
        <Flex justify="flex-end">
          <Button
            variant="ghost"
            colorPalette="teal"
            size="sm"
            gap={1}
            onClick={() => onOpenShiftBoard(_id)}
            fontWeight="semibold"
          >
            シフトを見る
            <LuArrowRight />
          </Button>
        </Flex>
      </Stack>
    </Flex>
  );
}

function relativeDeadline(deadline: string, status: RecruitmentDisplayStatus): string {
  if (status === "confirmed") return `${formatDateShort(deadline)} 確定済み`;
  const days = dayjs(deadline).startOf("day").diff(dayjs().startOf("day"), "day");
  if (status === "past-deadline") {
    return `${formatDateShort(deadline)} 締切済み`;
  }
  if (days === 0) return "今日が締切";
  if (days === 1) return "あと1日で締切";
  return `あと${days}日で締切`;
}
