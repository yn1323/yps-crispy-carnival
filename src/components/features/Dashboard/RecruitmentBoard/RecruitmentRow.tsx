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
  { label: string; colorPalette: "teal" | "orange" | "gray"; accent: string }
> = {
  collecting: { label: "募集中", colorPalette: "teal", accent: "teal.400" },
  "past-deadline": { label: "締切済み", colorPalette: "orange", accent: "orange.400" },
  confirmed: { label: "確定済み", colorPalette: "gray", accent: "gray.400" },
};

export function RecruitmentRow({ recruitment, dataTour, onOpenShiftBoard, onDeleteRecruitment }: Props) {
  const { _id, periodStart, periodEnd, deadline, responseCount, totalStaffCount } = recruitment;
  const displayStatus = getDisplayStatus(recruitment);
  const { label, colorPalette, accent } = statusConfig[displayStatus];
  const relativeText = relativeDeadline(deadline, displayStatus);
  const periodLabel = `${formatDateShort(periodStart)} 〜 ${formatDateShort(periodEnd)}`;

  return (
    <Flex
      data-tour={dataTour}
      align="stretch"
      bg="white"
      borderRadius="xl"
      overflow="hidden"
      borderWidth="1px"
      borderColor="blackAlpha.50"
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
            <Text fontSize="md" fontWeight="semibold" color="gray.900" lineHeight="short" whiteSpace="nowrap">
              {periodLabel}
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
              提出 {responseCount}/{totalStaffCount}人
            </Text>
          </HStack>
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

function relativeDeadline(deadline: string, status: RecruitmentDisplayStatus): string {
  if (status === "confirmed") return `${formatDateShort(deadline)} 確定済み`;
  if (status === "past-deadline") return `${formatDateShort(deadline)} 締切済み`;
  const days = dayjs(deadline).startOf("day").diff(dayjs().startOf("day"), "day");
  if (days === 0) return "今日が締切！";
  return `締切まで${days}日`;
}
