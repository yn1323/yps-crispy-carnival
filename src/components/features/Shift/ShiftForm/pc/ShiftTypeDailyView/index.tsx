import { Box, Flex, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import type { StaffType } from "@/src/domains/shift/types";
import { Avatar, StaffWarningIcon } from "../../components";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import type { ShiftTypeOptionColor } from "../../shiftTypeOptionStyles";
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
import { DateRail } from "../DailyView/DateRail";
import { DayTitle } from "../DailyView/DayTitle";
import {
  buildShiftTypeDailyViewModel,
  type ShiftTypeDailyAssignmentCellViewModel,
  type ShiftTypeDailyRequestBadgeViewModel,
  type ShiftTypeDailyRowViewModel,
} from "./script";

export const ShiftTypeDailyView = () => {
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
      buildShiftTypeDailyViewModel({
        submissionPattern,
        shifts: shiftsForDate,
        staffs: sortedStaffs,
        selectedDate,
        holidays,
        isConfirmedDisplay,
        warningMessagesByStaffId,
      }),
    [
      holidays,
      isConfirmedDisplay,
      selectedDate,
      shiftsForDate,
      sortedStaffs,
      submissionPattern,
      warningMessagesByStaffId,
    ],
  );
  useLockedDailyStaffOrder(selectedDate);

  const handleToggle = (staff: StaffType, option: ShiftTypeOptionLike) => {
    toggleAssignment({ staff, date: selectedDate, option });
  };

  return (
    <Flex flex={1} minH={0} overflow="hidden">
      <DateRail
        dates={dates}
        selectedDate={selectedDate}
        onSelect={selectDate}
        holidays={holidays}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
      />
      <Flex direction="column" minW={0} minH={0} flex={1} overflow="hidden">
        <DayTitle date={selectedDate} holidays={holidays} />
        {viewModel.isShopClosedDate ? (
          <Flex flex={1} minH={0} bg="gray.50" align="center" justify="center" direction="column" gap={2} px={6}>
            <Text fontSize="md" fontWeight="bold" color="gray.700">
              定休日
            </Text>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              この日は店舗の定休日のため、シフトを登録できません。
            </Text>
          </Flex>
        ) : (
          <Box flex={1} minH={0} overflow="auto" bg="gray.50">
            <Box minW={`${viewModel.minimumTableWidth}px`} bg="white" overflow="hidden">
              <Box as="table" w="100%" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <Box as="colgroup">
                  <Box as="col" style={{ width: viewModel.columnWidths.staff }} />
                  <Box as="col" style={{ width: viewModel.columnWidths.request }} />
                  {viewModel.optionColumns.map((option) => (
                    <Box as="col" key={option.key} style={{ width: viewModel.columnWidths.option }} />
                  ))}
                </Box>
                <Box as="thead">
                  <Box as="tr" bg="gray.50">
                    <HeaderCell>スタッフ</HeaderCell>
                    <HeaderCell>{viewModel.requestHeaderLabel}</HeaderCell>
                    {viewModel.optionColumns.map((option) => (
                      <HeaderCell key={option.key} optionColor={option.color}>
                        <Box fontWeight={700}>{option.name}</Box>
                        <Box textStyle="2xs" color={option.color.accent} mt="2px" fontVariantNumeric="tabular-nums">
                          {option.timeLabel}
                        </Box>
                      </HeaderCell>
                    ))}
                  </Box>
                  <Box as="tr">
                    <HeaderCell muted bg="gray.50">
                      人数
                    </HeaderCell>
                    <HeaderCell muted bg="gray.50" />
                    {viewModel.optionColumns.map((option) => (
                      <HeaderCell key={option.key} muted optionColor={option.color} tone="count">
                        <Text color={option.color.accent} fontWeight={700}>
                          {option.countLabel}
                        </Text>
                      </HeaderCell>
                    ))}
                  </Box>
                </Box>
                <Box as="tbody">
                  {viewModel.rows.map((row) => (
                    <Box as="tr" key={row.key} borderTopWidth="1px" borderColor="gray.100">
                      <StaffCell row={row} />
                      <RequestCell badges={row.requestBadges} />
                      {row.cells.map((cell) => (
                        <ShiftTypeCell
                          key={cell.key}
                          cell={cell}
                          isReadOnly={isReadOnly}
                          onToggle={() => handleToggle(row.staff, cell.option)}
                        />
                      ))}
                    </Box>
                  ))}
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

const StaffCell = ({ row }: { row: ShiftTypeDailyRowViewModel }) => (
  <Box as="td" px={4} py={2} borderRightWidth="1px" borderColor="gray.100">
    <Flex align="center" gap={3} minW={0}>
      <Avatar staff={row.staff} size={24} />
      <Text textStyle="sm" fontWeight={500} color={row.isStaffNameMuted ? "gray.500" : "gray.800"} flex={1} truncate>
        {row.staffName}
      </Text>
      <StaffWarningIcon messages={row.warningMessages} />
    </Flex>
  </Box>
);

const RequestCell = ({ badges }: { badges: ShiftTypeDailyRequestBadgeViewModel[] }) => (
  <Box as="td" px={4} py={2} borderRightWidth="1px" borderColor="gray.100">
    <Flex align="center" gap={1} minW={0} wrap="wrap">
      {badges.map((badge) => (
        <RequestBadge key={badge.key} bg={badge.bg} color={badge.color}>
          {badge.label}
        </RequestBadge>
      ))}
    </Flex>
  </Box>
);

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
  cell,
  isReadOnly,
  onToggle,
}: {
  cell: ShiftTypeDailyAssignmentCellViewModel;
  isReadOnly: boolean;
  onToggle: () => void;
}) => (
  <Box as="td" p={0} borderRightWidth="1px" borderColor="gray.100" _last={{ borderRightWidth: 0 }}>
    <Box
      as="button"
      aria-label={cell.ariaLabel}
      aria-disabled={isReadOnly}
      onClick={isReadOnly ? undefined : onToggle}
      w="calc(100% - 8px)"
      minH="32px"
      m="4px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg={cell.assigned ? cell.color.assignedBg : "white"}
      borderWidth="1px"
      borderColor={cell.assigned ? cell.color.accent : "gray.200"}
      borderRadius="md"
      color={cell.assigned ? cell.color.accent : "gray.400"}
      fontSize="xl"
      fontWeight={cell.assigned ? 700 : 500}
      cursor={isReadOnly ? "default" : "pointer"}
      position="relative"
      isolation="isolate"
      overflow="hidden"
      transitionProperty="colors"
      transitionDuration="faster"
      _before={
        cell.assigned
          ? {
              content: '""',
              position: "absolute",
              inset: 0,
              zIndex: -1,
              borderRadius: "inherit",
              bg: "blackAlpha.200",
              opacity: 0,
              pointerEvents: "none",
              transitionProperty: "opacity",
              transitionDuration: "faster",
            }
          : undefined
      }
      _hover={
        isReadOnly
          ? undefined
          : {
              bg: cell.assigned ? cell.color.headerBg : "gray.50",
              borderColor: cell.assigned ? cell.color.accent : "gray.400",
              color: cell.assigned ? cell.color.accent : "gray.500",
            }
      }
      _active={
        isReadOnly
          ? undefined
          : cell.assigned
            ? { _before: { opacity: 1, transitionDuration: "0ms" } }
            : { bg: "gray.100", transitionDuration: "0ms" }
      }
      _focusVisible={{ outline: "2px solid", outlineColor: cell.color.accent, outlineOffset: "1px" }}
    >
      {cell.symbol}
    </Box>
  </Box>
);
