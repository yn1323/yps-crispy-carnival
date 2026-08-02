import { Box, Flex, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import type { StaffType } from "@/src/domains/shift/types";
import { Avatar, DateIssueBadge, dateIssueBorderColor, StaffWarningIcon } from "../../components";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import { useScrollDateIntoView } from "../../hooks/useScrollDateIntoView";
import {
  dailySortedStaffsAtom,
  issueCountByDateAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsForSelectedDateAtom,
  toggleShiftTypeAssignmentAtom,
  warningCountByDateAtom,
  warningMessagesByStaffIdForSelectedDateAtom,
} from "../../stores";
import {
  buildSPShiftTypeDailyViewModel,
  type SPShiftTypeCountViewModel,
  type SPShiftTypeOptionViewModel,
  type SPShiftTypeStaffCardViewModel,
} from "./script";

const dayColor = (iso: string): string => {
  const day = dayjs(iso).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

export const SPShiftTypeDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shiftsForDate = useAtomValue(shiftsForSelectedDateAtom);
  const toggleAssignment = useSetAtom(toggleShiftTypeAssignmentAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const warningMessagesByStaffId = useAtomValue(warningMessagesByStaffIdForSelectedDateAtom);

  const { dates, holidays, isReadOnly, submissionPattern } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const viewModel = useMemo(
    () =>
      buildSPShiftTypeDailyViewModel({
        submissionPattern,
        shifts: shiftsForDate,
        staffs: sortedStaffs,
        isConfirmedDisplay,
      }),
    [isConfirmedDisplay, shiftsForDate, sortedStaffs, submissionPattern],
  );
  const isShopClosedDate = holidays.includes(selectedDate);
  const selectedDay = selectedDate ? dayjs(selectedDate) : null;
  const dateStripRef = useRef<HTMLDivElement>(null);
  useScrollDateIntoView(dateStripRef, selectedDate, "horizontal");
  useLockedDailyStaffOrder(selectedDate);

  const handleToggle = (staff: StaffType, option: ShiftTypeOptionLike) => {
    toggleAssignment({ staff, date: selectedDate, option });
  };

  return (
    <Flex direction="column" flex={1} minH={0}>
      <Box px={3} pt={3} pb={2} bg="white" borderBottomWidth="1px" borderColor="gray.100" flexShrink={0}>
        <Flex ref={dateStripRef} gap={2} overflow="auto" pt={2} pb={1}>
          {dates.map((iso) => {
            const date = dayjs(iso);
            const active = iso === selectedDate;
            const isClosed = holidays.includes(iso);
            const issueCount = issueCounts.get(iso) ?? 0;
            const warningCount = warningCounts.get(iso) ?? 0;
            const chipBorderColor = dateIssueBorderColor({
              active,
              issueCount,
              warningCount,
              activeColor: "teal.400",
              fallbackColor: "gray.200",
            });
            return (
              <Box
                key={iso}
                data-date-chip={iso}
                onClick={() => selectDate(iso)}
                position="relative"
                flexShrink={0}
                w="52px"
                py="8px"
                textAlign="center"
                borderRadius="md"
                borderWidth="1px"
                borderColor={chipBorderColor}
                bg={active ? "teal.50" : isClosed ? "gray.50" : "white"}
                cursor="pointer"
              >
                <DateIssueBadge issueCount={issueCount} warningCount={warningCount} />
                <Box
                  textStyle="md"
                  fontWeight={700}
                  color={active ? "teal.700" : "gray.800"}
                  lineHeight="1.1"
                  fontVariantNumeric="tabular-nums"
                >
                  {date.date()}
                </Box>
                <Box textStyle="2xs" mt="2px" fontWeight={active ? 700 : 500} style={{ color: dayColor(iso) }}>
                  {getWeekdayLabel(iso)}
                </Box>
                {isClosed && (
                  <Box textStyle="2xs" mt="1px" fontWeight={700} color="gray.500">
                    休
                  </Box>
                )}
              </Box>
            );
          })}
        </Flex>
      </Box>

      {selectedDay && (
        <Box px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
          <Flex align="baseline" gap={2}>
            <Box textStyle="xl" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
              {selectedDay.month() + 1}月{selectedDay.date()}日
            </Box>
            <Box textStyle="sm" fontWeight={600} style={{ color: dayColor(selectedDate) }}>
              ({getWeekdayLabel(selectedDate)})
            </Box>
            {isShopClosedDate && (
              <Box px={2} py={0.5} borderRadius="full" bg="gray.100" color="gray.600" textStyle="2xs" fontWeight={700}>
                定休日
              </Box>
            )}
          </Flex>
        </Box>
      )}

      <Box flex={1} minH={0} overflow="auto" bg="gray.50" px={3} py={3}>
        {isShopClosedDate ? (
          <Flex minH="240px" align="center" justify="center" direction="column" gap={2} px={4}>
            <Text textStyle="md" fontWeight={700} color="gray.700">
              定休日
            </Text>
            <Text textStyle="sm" color="fg.muted" textAlign="center" lineHeight={1.7}>
              この日は店舗の定休日のため、シフトを登録できません。
            </Text>
          </Flex>
        ) : (
          <Stack gap={2}>
            <ShiftTypeCountSummary items={viewModel.counts} />
            {viewModel.staffCards.map((card) => (
              <StaffShiftTypeCard
                key={card.staff.id}
                card={card}
                isReadOnly={isReadOnly}
                warningMessages={warningMessagesByStaffId.get(card.staff.id) ?? []}
                onToggle={(option) => handleToggle(card.staff, option)}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Flex>
  );
};

const ShiftTypeCountSummary = ({ items }: { items: SPShiftTypeCountViewModel[] }) => (
  <Box mb={1}>
    <SimpleGrid columns={4} gap={1.5}>
      {items.map((item) => (
        <Flex
          key={item.key}
          direction="column"
          align="center"
          justify="center"
          px={3}
          py={2}
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          bg={item.color.countBg}
          minH="64px"
        >
          <Text textStyle="xs" fontWeight={700} color="gray.800" textAlign="center">
            {item.name}
          </Text>
          <Text fontSize="xl" lineHeight={1.1} fontWeight={800} color={item.color.accent} mt={1}>
            {item.countLabel}
          </Text>
        </Flex>
      ))}
    </SimpleGrid>
  </Box>
);

const StaffShiftTypeCard = ({
  card,
  isReadOnly,
  warningMessages,
  onToggle,
}: {
  card: SPShiftTypeStaffCardViewModel;
  isReadOnly: boolean;
  warningMessages: string[];
  onToggle: (option: ShiftTypeOptionLike) => void;
}) => (
  <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="md" px={3} py={3}>
    <Flex align="center" gap={2}>
      <Avatar staff={card.staff} size={26} />
      <Text textStyle="sm" fontWeight={600} color={card.isNameMuted ? "gray.500" : "gray.800"} flex={1} truncate>
        {card.staff.name}
      </Text>
      <StaffWarningIcon messages={warningMessages} />
      <Flex gap={1} wrap="wrap" justify="flex-end" align="center">
        <Text textStyle="2xs" color="gray.500" fontWeight={600}>
          {card.requestSectionLabel}
        </Text>
        {card.requestBadges.map((badge) => (
          <RequestBadge key={badge.key} bg={badge.bg} color={badge.color}>
            {badge.label}
          </RequestBadge>
        ))}
      </Flex>
    </Flex>
    <SimpleGrid columns={2} gap={2} mt={3}>
      {card.options.map((option) => (
        <ShiftTypeOptionButton
          key={option.option.id}
          staffName={card.staff.name}
          viewModel={option}
          isReadOnly={isReadOnly}
          onToggle={() => onToggle(option.option)}
        />
      ))}
    </SimpleGrid>
  </Box>
);

const RequestBadge = ({ bg, color, children }: { bg: string; color: string; children: ReactNode }) => (
  <Box px={2} py="2px" borderRadius="full" textStyle="2xs" fontWeight={600} style={{ color, background: bg }}>
    {children}
  </Box>
);

const ShiftTypeOptionButton = ({
  staffName,
  viewModel,
  isReadOnly,
  onToggle,
}: {
  staffName: string;
  viewModel: SPShiftTypeOptionViewModel;
  isReadOnly: boolean;
  onToggle: () => void;
}) => (
  <Box
    as="button"
    aria-label={`${staffName} ${viewModel.name} ${viewModel.assigned ? "勤務あり" : "勤務なし"}`}
    aria-disabled={isReadOnly}
    onClick={isReadOnly ? undefined : onToggle}
    textAlign="left"
    px={3}
    py={2}
    borderWidth="1px"
    borderRadius="md"
    borderColor={viewModel.assigned ? viewModel.color.accent : "gray.200"}
    bg={viewModel.assigned ? viewModel.color.assignedBg : "white"}
    color={viewModel.assigned ? viewModel.color.accent : "gray.600"}
    cursor={isReadOnly ? "default" : "pointer"}
    _active={isReadOnly ? undefined : { bg: viewModel.assigned ? viewModel.color.headerBg : "gray.50" }}
  >
    <Flex align="center" gap={2}>
      <Text as="span" fontSize="lg" lineHeight={1} color={viewModel.assigned ? viewModel.color.accent : "gray.400"}>
        {viewModel.assigned ? "○" : "×"}
      </Text>
      <Box minW={0}>
        <Text textStyle="xs" fontWeight={700} truncate>
          {viewModel.name}
        </Text>
        <Text
          textStyle="2xs"
          color={viewModel.assigned ? viewModel.color.accent : "gray.500"}
          fontVariantNumeric="tabular-nums"
        >
          {viewModel.timeLabel}
        </Text>
      </Box>
    </Flex>
  </Box>
);
