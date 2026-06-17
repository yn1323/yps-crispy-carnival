import { Badge, Box, Flex, HStack, Menu, Portal, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { LuCalendarClock, LuEllipsisVertical, LuTrash2 } from "react-icons/lu";
import {
  getDisplayStatus,
  type Recruitment,
  type RecruitmentDisplayStatus,
} from "@/src/components/features/Dashboard/types";
import { IconButton } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";

type Props = {
  recruitment: Recruitment;
  dataTour?: string;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onDeleteRecruitment: (recruitment: Recruitment) => void;
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
  "past-deadline": { label: "締切済み", colorPalette: "orange", accent: "orange.400" },
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

export function RecruitmentRow({ recruitment, dataTour, onOpenShiftBoard, onDeleteRecruitment }: Props) {
  const { _id, periodStart, periodEnd, deadline, status, confirmedAt, responseCount, totalStaffCount } = recruitment;
  const displayStatus = getDisplayStatus(recruitment);
  const { colorPalette, accent, borderColor, bg } = statusConfig[displayStatus];
  const label = displayStatus === "ended" && status === "open" ? "締切済み" : statusConfig[displayStatus].label;
  const relativeText = relativeDeadline({ deadline, confirmedAt, displayStatus, recruitmentStatus: status });
  const periodLabel = `${formatDateShort(periodStart)} 〜 ${formatDateShort(periodEnd)}`;
  const isCurrent = displayStatus === "current";
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
      _hover={{ boxShadow: "sm" }}
    >
      <Box w="4px" bg={accent} flexShrink={0} />
      <Flex
        as="button"
        aria-label={`${periodLabel}のシフトを見る`}
        onClick={() => onOpenShiftBoard(_id)}
        flex={1}
        minW={0}
        px={{ base: 3.5, lg: 4 }}
        py={3}
        align="stretch"
        gap={{ base: 2, lg: 3 }}
        cursor="pointer"
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.500", outlineOffset: "-2px" }}
      >
        <Flex
          flex={1}
          minW={0}
          direction={{ base: "column", lg: "row" }}
          align={{ base: "stretch", lg: "center" }}
          gap={{ base: 2, lg: 4 }}
        >
          <Flex align="center" gap={3} flexShrink={0} minW={{ lg: "140px" }}>
            <Text fontSize="md" fontWeight="semibold" color={textColor} lineHeight="short" whiteSpace="nowrap">
              {periodLabel}
            </Text>
          </Flex>

          <Flex
            flex={1}
            minW={0}
            direction={{ base: "column", md: "row" }}
            align={{ base: "stretch", md: "center" }}
            gap={{ base: 2, md: 4 }}
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
              wrap="wrap"
            >
              <HStack gap={1} justify="flex-end" minW={{ base: "132px", lg: "160px" }} flexShrink={0}>
                <LuCalendarClock />
                <Text whiteSpace="nowrap" textAlign="right">
                  {relativeText}
                </Text>
              </HStack>
              <Text
                fontSize="xs"
                color="fg.muted"
                whiteSpace="nowrap"
                minW={{ base: "84px", lg: "96px" }}
                textAlign="right"
              >
                提出 {responseCount}/{totalStaffCount}人
              </Text>
            </HStack>
          </Flex>
        </Flex>
      </Flex>
      <Flex align="center" justify="center" pe={{ base: 2, lg: 3 }} flexShrink={0}>
        <Menu.Root positioning={{ placement: "bottom-end" }}>
          <Menu.Trigger asChild>
            <IconButton aria-label={`${periodLabel}の募集操作メニュー`} variant="ghost" size="sm" color="fg.muted">
              <LuEllipsisVertical />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="180px">
                <Menu.Item
                  value="delete"
                  color="red.600"
                  cursor="pointer"
                  onClick={() => onDeleteRecruitment(recruitment)}
                >
                  <LuTrash2 />
                  募集を削除
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Flex>
    </Flex>
  );
}

function relativeDeadline({
  deadline,
  confirmedAt,
  displayStatus,
  recruitmentStatus,
}: {
  deadline: string;
  confirmedAt: number | null;
  displayStatus: RecruitmentDisplayStatus;
  recruitmentStatus: Recruitment["status"];
}): string {
  if (displayStatus === "ended" && recruitmentStatus === "open") return `${formatDateShort(deadline)} 締切済み`;
  if (displayStatus === "current" || displayStatus === "confirmed" || displayStatus === "ended") {
    return confirmedAt ? `確定 ${formatDateShort(dayjs(confirmedAt).format("YYYY-MM-DD"))}` : "確定済み";
  }
  if (displayStatus === "past-deadline") return `${formatDateShort(deadline)} 締切済み`;
  const days = dayjs(deadline).startOf("day").diff(dayjs().startOf("day"), "day");
  if (days === 0) return "今日が締切！";
  return `締切まで${days}日`;
}
