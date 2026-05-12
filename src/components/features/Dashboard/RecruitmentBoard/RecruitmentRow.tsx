import { Badge, Box, Flex, HStack, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { LuCalendarClock, LuChevronRight } from "react-icons/lu";
import {
  getDisplayStatus,
  type Recruitment,
  type RecruitmentDisplayStatus,
} from "@/src/components/features/Dashboard/types";
import { formatDateShort } from "@/src/domains/shift/date";

type Props = {
  recruitment: Recruitment;
  dataTour?: string;
  onOpenShiftBoard: (recruitmentId: string) => void;
};

const statusConfig: Record<
  RecruitmentDisplayStatus,
  { label: string; colorPalette: "teal" | "orange" | "gray"; accent: string }
> = {
  collecting: { label: "募集中", colorPalette: "teal", accent: "teal.400" },
  "past-deadline": { label: "締切済み", colorPalette: "orange", accent: "orange.400" },
  confirmed: { label: "確定済み", colorPalette: "gray", accent: "gray.400" },
};

export function RecruitmentRow({ recruitment, dataTour, onOpenShiftBoard }: Props) {
  const { _id, periodStart, periodEnd, deadline, responseCount } = recruitment;
  const displayStatus = getDisplayStatus(recruitment);
  const { label, colorPalette, accent } = statusConfig[displayStatus];
  const relativeText = relativeDeadline(deadline, displayStatus);

  return (
    <Flex
      as="button"
      data-tour={dataTour}
      aria-label={`${formatDateShort(periodStart)} 〜 ${formatDateShort(periodEnd)}のシフトを見る`}
      onClick={() => onOpenShiftBoard(_id)}
      align="stretch"
      bg="white"
      borderRadius="xl"
      overflow="hidden"
      borderWidth="1px"
      borderColor="blackAlpha.50"
      boxShadow="xs"
      cursor="pointer"
      textAlign="left"
      w="full"
      transition="box-shadow 0.15s"
      _hover={{ boxShadow: "sm" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.500", outlineOffset: "2px" }}
    >
      <Box w="4px" bg={accent} flexShrink={0} />
      <Flex
        flex={1}
        minW={0}
        px={{ base: 3.5, lg: 4 }}
        py={3}
        direction={{ base: "column", lg: "row" }}
        align={{ base: "stretch", lg: "center" }}
        gap={{ base: 2, lg: 4 }}
      >
        <Flex align="center" gap={3} flexShrink={0} minW={{ lg: "140px" }}>
          <Text fontSize="md" fontWeight="semibold" color="gray.900" lineHeight="short" whiteSpace="nowrap">
            {formatDateShort(periodStart)} 〜 {formatDateShort(periodEnd)}
          </Text>
        </Flex>

        <HStack gap={{ base: 2, lg: 5 }} flex={1} minW={0} wrap={{ base: "wrap", lg: "nowrap" }}>
          <Box minW={{ lg: "84px" }} flexShrink={0}>
            <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2.5} fontSize="xs">
              {label}
            </Badge>
          </Box>
          <HStack gap={1} color="fg.muted" fontSize="xs" minW={{ lg: "160px" }} flexShrink={0}>
            <LuCalendarClock />
            <Text whiteSpace="nowrap">{relativeText}</Text>
          </HStack>
          <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
            提出 {responseCount}人
          </Text>
        </HStack>
      </Flex>
      <Flex align="center" justify="center" px={{ base: 3, lg: 4 }} color="teal.700" flexShrink={0}>
        <LuChevronRight size={22} />
      </Flex>
    </Flex>
  );
}

function relativeDeadline(deadline: string, status: RecruitmentDisplayStatus): string {
  if (status === "confirmed") return `${formatDateShort(deadline)} 確定済み`;
  if (status === "past-deadline") return `${formatDateShort(deadline)} 締切済み`;
  const days = dayjs(deadline).startOf("day").diff(dayjs().startOf("day"), "day");
  if (days === 0) return "今日が締切！";
  return `締切まで${days}日`;
}
