import { Box, Flex, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import {
  countShiftTypeAssignments,
  getRequestedShiftTypeOptionIds,
  hasShiftTypeAssignment,
  type ShiftTypeOptionLike,
  toggleShiftTypeAssignment,
} from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { Avatar, StaffWarningIcon } from "../../components";
import {
  issueCountByDateAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  sortedStaffsAtom,
  warningCountByDateAtom,
  warningMessagesByStaffIdForSelectedDateAtom,
} from "../../stores";
import { formatShiftTypeTimeRange } from "../../utils/shiftTypeDisplay";
import { DateRail } from "../DailyView/DateRail";
import { DayTitle } from "../DailyView/DayTitle";
import {
  getShiftTypeOptionColor,
  SHIFT_TYPE_REQUEST_STATUS_COLORS,
  type ShiftTypeOptionColor,
} from "../shiftTypeOptionStyles";

const STAFF_COL_WIDTH = 220;
const REQUEST_COL_WIDTH = 150;
const OPTION_COL_WIDTH = 150;

export const ShiftTypeDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const warningMessagesByStaffId = useAtomValue(warningMessagesByStaffIdForSelectedDateAtom);

  const { dates, holidays, isReadOnly, submissionPattern } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";
  const pattern = submissionPattern?.kind === "shiftType" ? submissionPattern : null;
  const options = useMemo(() => [...(pattern?.options ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [pattern]);
  const fallbackPosition = config.positions[0] ?? DEFAULT_POSITION;
  const isShopClosedDate = holidays.includes(selectedDate);

  const shiftsForDate = useMemo(() => shifts.filter((shift) => shift.date === selectedDate), [shifts, selectedDate]);
  const shiftByStaffId = useMemo(() => new Map(shiftsForDate.map((shift) => [shift.staffId, shift])), [shiftsForDate]);
  const counts = useMemo(
    () =>
      countShiftTypeAssignments(
        shiftsForDate,
        options.map((option) => option.id),
      ),
    [shiftsForDate, options],
  );

  const handleToggle = (staff: StaffType, option: ShiftTypeOptionLike) => {
    if (isReadOnly) return;
    setShifts((current) =>
      toggleShiftTypeAssignment({
        shifts: current,
        staff,
        date: selectedDate,
        option,
        position: fallbackPosition,
      }),
    );
  };

  return (
    <Flex flex={1} minH={0} overflow="hidden">
      <DateRail
        dates={dates}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        holidays={holidays}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
      />
      <Flex direction="column" minW={0} minH={0} flex={1} overflow="hidden">
        <DayTitle date={selectedDate} holidays={holidays} />
        {isShopClosedDate ? (
          <Flex flex={1} minH={0} bg="gray.50" align="center" justify="center" direction="column" gap={2} px={6}>
            <Text fontSize="md" fontWeight="bold" color="gray.700">
              定休日
            </Text>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              この日はお店のお休みとして設定されているため、シフトは登録できません。
            </Text>
          </Flex>
        ) : (
          <Box flex={1} minH={0} overflow="auto" bg="gray.50">
            <Box
              minW={`${STAFF_COL_WIDTH + REQUEST_COL_WIDTH + options.length * OPTION_COL_WIDTH}px`}
              bg="white"
              overflow="hidden"
            >
              <Box as="table" w="100%" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <Box as="colgroup">
                  <Box as="col" style={{ width: STAFF_COL_WIDTH }} />
                  <Box as="col" style={{ width: REQUEST_COL_WIDTH }} />
                  {options.map((option) => (
                    <Box as="col" key={option.id} style={{ width: OPTION_COL_WIDTH }} />
                  ))}
                </Box>
                <Box as="thead">
                  <Box as="tr" bg="gray.50">
                    <HeaderCell>スタッフ</HeaderCell>
                    <HeaderCell>{isConfirmedDisplay ? "確定" : "希望"}</HeaderCell>
                    {options.map((option, index) => {
                      const optionColor = getShiftTypeOptionColor(index);
                      return (
                        <HeaderCell key={option.id} optionColor={optionColor}>
                          <Box fontWeight={700}>{option.name}</Box>
                          <Box textStyle="2xs" color={optionColor.accent} mt="2px" fontVariantNumeric="tabular-nums">
                            {formatShiftTypeTimeRange(option)}
                          </Box>
                        </HeaderCell>
                      );
                    })}
                  </Box>
                  <Box as="tr">
                    <HeaderCell muted bg="gray.50">
                      人数
                    </HeaderCell>
                    <HeaderCell muted bg="gray.50" />
                    {options.map((option, index) => {
                      const optionColor = getShiftTypeOptionColor(index);
                      return (
                        <HeaderCell key={option.id} muted optionColor={optionColor} tone="count">
                          <Text color={optionColor.accent} fontWeight={700}>
                            {counts.get(option.id) ?? 0}人
                          </Text>
                        </HeaderCell>
                      );
                    })}
                  </Box>
                </Box>
                <Box as="tbody">
                  {sortedStaffs.map((staff) => {
                    const shift = shiftByStaffId.get(staff.id);
                    return (
                      <Box as="tr" key={staff.id} borderTopWidth="1px" borderColor="gray.100">
                        <StaffCell staff={staff} warningMessages={warningMessagesByStaffId.get(staff.id) ?? []} />
                        <RequestCell staff={staff} shift={shift} options={options} />
                        {options.map((option, index) => {
                          const assigned = hasShiftTypeAssignment(shift, option.id);
                          const optionColor = getShiftTypeOptionColor(index);
                          return (
                            <ShiftTypeCell
                              key={option.id}
                              staff={staff}
                              option={option}
                              optionColor={optionColor}
                              assigned={assigned}
                              isReadOnly={isReadOnly}
                              onToggle={() => handleToggle(staff, option)}
                            />
                          );
                        })}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Flex>
    </Flex>
  );
};

const HeaderCell = ({
  children,
  muted = false,
  optionColor,
  tone = "header",
  bg,
}: {
  children?: ReactNode;
  muted?: boolean;
  optionColor?: ShiftTypeOptionColor;
  tone?: "header" | "count";
  bg?: string;
}) => (
  <Box
    as="th"
    px={4}
    py={2}
    textAlign="center"
    borderRightWidth="1px"
    borderColor="gray.200"
    bg={bg ?? (optionColor ? (tone === "count" ? optionColor.countBg : optionColor.headerBg) : undefined)}
    color={optionColor ? optionColor.accent : muted ? "gray.600" : "gray.800"}
    textStyle="xs"
    fontWeight={600}
    _last={{ borderRightWidth: 0 }}
  >
    {children}
  </Box>
);

const StaffCell = ({ staff, warningMessages }: { staff: StaffType; warningMessages: string[] }) => (
  <Box as="td" px={4} py={2} borderRightWidth="1px" borderColor="gray.100">
    <Flex align="center" gap={3} minW={0}>
      <Avatar staff={staff} size={24} />
      <Text textStyle="sm" fontWeight={500} color={staff.isSubmitted ? "gray.800" : "gray.500"} flex={1} truncate>
        {staff.name}
      </Text>
      <StaffWarningIcon messages={warningMessages} />
    </Flex>
  </Box>
);

const RequestCell = ({
  staff,
  shift,
  options,
}: {
  staff: StaffType;
  shift: ShiftData | undefined;
  options: ShiftTypeOptionLike[];
}) => {
  const requestedIds = getRequestedShiftTypeOptionIds(shift);
  const optionById = new Map(
    options.map((option, index) => [option.id, { option, color: getShiftTypeOptionColor(index) }]),
  );

  return (
    <Box as="td" px={4} py={2} borderRightWidth="1px" borderColor="gray.100">
      <Flex align="center" gap={1} minW={0} wrap="wrap">
        {!staff.isSubmitted ? (
          <RequestBadge
            bg={SHIFT_TYPE_REQUEST_STATUS_COLORS.unsubmitted.bg}
            color={SHIFT_TYPE_REQUEST_STATUS_COLORS.unsubmitted.color}
          >
            未提出
          </RequestBadge>
        ) : requestedIds.length === 0 ? (
          <RequestBadge
            bg={SHIFT_TYPE_REQUEST_STATUS_COLORS.rest.bg}
            color={SHIFT_TYPE_REQUEST_STATUS_COLORS.rest.color}
          >
            休み
          </RequestBadge>
        ) : (
          requestedIds.map((optionId) => {
            const optionItem = optionById.get(optionId);
            return (
              <RequestBadge
                key={optionId}
                bg={optionItem?.color.requestedBg ?? "gray.100"}
                color={optionItem?.color.accent ?? "gray.700"}
              >
                {optionItem?.option.name ?? "勤務区分"}
              </RequestBadge>
            );
          })
        )}
      </Flex>
    </Box>
  );
};

const RequestBadge = ({ bg, color, children }: { bg: string; color: string; children: ReactNode }) => (
  <Box
    flexShrink={0}
    px={2}
    py="2px"
    borderRadius="full"
    textStyle="2xs"
    fontWeight={600}
    style={{ color, background: bg }}
  >
    {children}
  </Box>
);

const ShiftTypeCell = ({
  staff,
  option,
  optionColor,
  assigned,
  isReadOnly,
  onToggle,
}: {
  staff: StaffType;
  option: ShiftTypeOptionLike;
  optionColor: ShiftTypeOptionColor;
  assigned: boolean;
  isReadOnly: boolean;
  onToggle: () => void;
}) => (
  <Box as="td" p={0} borderRightWidth="1px" borderColor="gray.100" _last={{ borderRightWidth: 0 }}>
    <Box
      as="button"
      aria-label={`${staff.name} ${option.name} ${assigned ? "勤務あり" : "勤務なし"}`}
      aria-disabled={isReadOnly}
      onClick={isReadOnly ? undefined : onToggle}
      w="calc(100% - 8px)"
      minH="32px"
      m="4px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg={assigned ? optionColor.assignedBg : "white"}
      borderWidth="1px"
      borderColor={assigned ? optionColor.accent : "gray.200"}
      borderRadius="md"
      color={assigned ? optionColor.accent : "gray.400"}
      fontSize="xl"
      fontWeight={assigned ? 700 : 500}
      cursor={isReadOnly ? "default" : "pointer"}
      transition="background 0.12s ease, border-color 0.12s ease, color 0.12s ease"
      _hover={
        isReadOnly
          ? undefined
          : {
              bg: assigned ? optionColor.headerBg : "gray.50",
              borderColor: assigned ? optionColor.accent : "gray.400",
              color: assigned ? optionColor.accent : "gray.500",
            }
      }
      _focusVisible={{ outline: "2px solid", outlineColor: optionColor.accent, outlineOffset: "1px" }}
    >
      {assigned ? "○" : "×"}
    </Box>
  </Box>
);
