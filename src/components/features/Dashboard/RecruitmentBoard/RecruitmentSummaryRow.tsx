import { Badge, Box, Flex, HStack, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { LuCalendarClock } from "react-icons/lu";
import {
  getDisplayStatus,
  type Recruitment,
  type RecruitmentDisplayStatus,
} from "@/src/components/features/Dashboard/types";
import { formatDateShort } from "@/src/domains/shift/date";

type Props = {
  recruitment: Recruitment;
  dataTour?: string;
  onClick?: () => void;
  ariaLabel?: string;
  endSlot?: ReactNode;
};

const statusConfig: Record<
  RecruitmentDisplayStatus,
  {
    label: string;
    colorPalette: "green" | "orange" | "blue" | "gray";
    accent: string;
    borderColor?: string;
    bg?: string;
  }
> = {
  collecting: { label: "募集中", colorPalette: "green", accent: "green.400" },
  "action-required": {
    label: "要シフト調整",
    colorPalette: "orange",
    accent: "orange.400",
    borderColor: "orange.200",
    bg: "orange.50/30",
  },
  current: {
    label: "確定済み",
    colorPalette: "blue",
    accent: "blue.400",
    borderColor: "blue.200",
    bg: "blue.50/30",
  },
  confirmed: { label: "確定済み", colorPalette: "blue", accent: "blue.300" },
  ended: { label: "確定済み", colorPalette: "gray", accent: "gray.300" },
};

export function RecruitmentSummaryRow({ recruitment, dataTour, onClick, ariaLabel, endSlot }: Props) {
  const { periodStart, periodEnd, deadline, confirmedAt, responseCount, totalStaffCount } = recruitment;
  const displayStatus = getDisplayStatus(recruitment);
  const { colorPalette, accent, borderColor, bg } = statusConfig[displayStatus];
  const label = statusConfig[displayStatus].label;
  const relativeText = relativeDeadline({ deadline, periodEnd, confirmedAt, displayStatus });
  const periodLabel = `${formatDateShort(periodStart)} 〜 ${formatDateShort(periodEnd)}`;
  const isCurrent = displayStatus === "current";
  const isActionRequired = displayStatus === "action-required";
  const textColor = displayStatus === "ended" ? "gray.700" : "gray.900";

  return (
    <Flex
      data-tour={dataTour}
      align="stretch"
      bg={bg ?? "white"}
      borderRadius="xl"
      overflow="hidden"
      borderWidth="1px"
      borderColor={borderColor ?? "blackAlpha.50"}
      boxShadow="xs"
      textAlign="left"
      w="full"
      transition="box-shadow 0.15s"
      _hover={{ boxShadow: onClick ? "sm" : "xs" }}
    >
      <Box w="4px" bg={accent} flexShrink={0} />
      <Flex
        as={onClick ? "button" : "div"}
        aria-label={onClick ? ariaLabel : undefined}
        onClick={onClick}
        flex={1}
        minW={0}
        px={{ base: 3.5, lg: 4 }}
        py={{ base: 2.5, lg: 3 }}
        align="stretch"
        gap={{ base: 1.5, lg: 3 }}
        cursor={onClick ? "pointer" : undefined}
        _focusVisible={onClick ? { outline: "2px solid", outlineColor: "teal.500", outlineOffset: "-2px" } : undefined}
      >
        <Flex
          flex={1}
          minW={0}
          direction={{ base: "column", lg: "row" }}
          align={{ base: "stretch", lg: "center" }}
          gap={{ base: 1.5, lg: 4 }}
        >
          <Flex align="center" gap={3} flexShrink={0} minW={{ lg: "140px" }}>
            <Text fontSize="md" fontWeight="semibold" color={textColor} lineHeight="short" whiteSpace="nowrap">
              {periodLabel}
            </Text>
          </Flex>

          <Flex
            flex={1}
            minW={0}
            direction="row"
            align="center"
            justify={{ base: "space-between", md: "flex-end" }}
            gap={{ base: 2, md: 4 }}
            wrap={{ base: "wrap", sm: "nowrap" }}
          >
            <HStack minW={{ lg: isCurrent ? "176px" : "84px" }} flexShrink={0} gap={2} wrap="wrap">
              <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2.5} fontSize="xs">
                {label}
              </Badge>
              {isCurrent && (
                <Badge colorPalette="blue" variant="solid" borderRadius="full" px={2.5} fontSize="xs">
                  現在利用中
                </Badge>
              )}
            </HStack>
            <HStack
              gap={{ base: 3, lg: 8 }}
              flex={1}
              justify="flex-end"
              align="center"
              color="fg.muted"
              fontSize="xs"
              minW={0}
              wrap="nowrap"
            >
              <HStack
                gap={1}
                justify="flex-end"
                minW={0}
                flexShrink={1}
                color={isActionRequired ? "orange.700" : undefined}
              >
                <LuCalendarClock />
                <Text whiteSpace="nowrap" textAlign="right" fontWeight={isActionRequired ? "semibold" : "normal"}>
                  {relativeText}
                </Text>
              </HStack>
              <Text
                fontSize="xs"
                color="fg.muted"
                whiteSpace="nowrap"
                minW={{ lg: "96px" }}
                textAlign="right"
                flexShrink={0}
              >
                提出 {responseCount}/{totalStaffCount}人
              </Text>
            </HStack>
          </Flex>
        </Flex>
      </Flex>
      {endSlot && (
        <Flex align="center" justify="center" pe={{ base: 2, lg: 3 }} flexShrink={0}>
          {endSlot}
        </Flex>
      )}
    </Flex>
  );
}

function relativeDeadline({
  deadline,
  periodEnd,
  confirmedAt,
  displayStatus,
}: {
  deadline: string;
  periodEnd: string;
  confirmedAt: number | null;
  displayStatus: RecruitmentDisplayStatus;
}): string {
  if (displayStatus === "current" || displayStatus === "confirmed" || displayStatus === "ended") {
    return confirmedAt ? `確定 ${formatDateShort(dayjs(confirmedAt).format("YYYY-MM-DD"))}` : "確定済み";
  }
  if (displayStatus === "action-required") {
    const today = dayjs().format("YYYY-MM-DD");
    return deadline < today ? `${formatDateShort(deadline)} 締切済み` : `${formatDateShort(periodEnd)} 期間終了`;
  }
  const days = dayjs(deadline).startOf("day").diff(dayjs().startOf("day"), "day");
  if (days === 0) return "今日が締切！";
  return `締切まで${days}日`;
}
