import { Box, Flex, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import {
  countShiftTypeAssignments,
  getRequestedShiftTypeOptionIds,
  hasShiftTypeAssignment,
  type ShiftTypeOptionLike,
  toggleShiftTypeAssignment,
} from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { Avatar } from "../../components";
import { getShiftTypeOptionColor, type ShiftTypeOptionColor } from "../../pc/shiftTypeOptionStyles";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, sortedStaffsAtom } from "../../stores";
import { formatShiftTypeTimeRange } from "../../utils/shiftTypeDisplay";

const dayColor = (iso: string): string => {
  const day = dayjs(iso).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

export const SPShiftTypeDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);

  const { dates, holidays, isReadOnly, submissionPattern } = config;
  const pattern = submissionPattern?.kind === "shiftType" ? submissionPattern : null;
  const options = useMemo(() => [...(pattern?.options ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [pattern]);
  const fallbackPosition = config.positions[0] ?? DEFAULT_POSITION;
  const isShopClosedDate = holidays.includes(selectedDate);
  const selectedDay = selectedDate ? dayjs(selectedDate) : null;

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
    <Flex direction="column" flex={1} minH={0}>
      <Box px={3} pt={3} pb={2} bg="white" borderBottomWidth="1px" borderColor="gray.100" flexShrink={0}>
        <Flex gap={2} overflow="auto" pb={1}>
          {dates.map((iso) => {
            const date = dayjs(iso);
            const active = iso === selectedDate;
            const isClosed = holidays.includes(iso);
            return (
              <Box
                key={iso}
                onClick={() => setSelectedDate(iso)}
                flexShrink={0}
                w="52px"
                py="8px"
                textAlign="center"
                borderRadius="md"
                borderWidth="1px"
                borderColor={active ? "teal.400" : "gray.200"}
                bg={active ? "teal.50" : isClosed ? "gray.50" : "white"}
                cursor="pointer"
              >
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
              この日はお店のお休みとして設定されているため、シフトは登録できません。
            </Text>
          </Flex>
        ) : (
          <Stack gap={2}>
            <ShiftTypeCountSummary options={options} counts={counts} />
            {sortedStaffs.map((staff) => (
              <StaffShiftTypeCard
                key={staff.id}
                staff={staff}
                shift={shiftByStaffId.get(staff.id)}
                options={options}
                isReadOnly={isReadOnly}
                onToggle={(option) => handleToggle(staff, option)}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Flex>
  );
};

const ShiftTypeCountSummary = ({
  options,
  counts,
}: {
  options: ShiftTypeOptionLike[];
  counts: Map<string, number>;
}) => (
  <Box mb={1}>
    <SimpleGrid columns={4} gap={1.5}>
      {options.map((option, index) => {
        const optionColor = getShiftTypeOptionColor(index);
        return (
          <Flex
            key={option.id}
            direction="column"
            align="center"
            justify="center"
            px={3}
            py={2}
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="md"
            bg={optionColor.countBg}
            minH="64px"
          >
            <Text textStyle="xs" fontWeight={700} color="gray.800" textAlign="center">
              {option.name}
            </Text>
            <Text fontSize="xl" lineHeight={1.1} fontWeight={800} color={optionColor.accent} mt={1}>
              {counts.get(option.id) ?? 0}人
            </Text>
          </Flex>
        );
      })}
    </SimpleGrid>
  </Box>
);

const StaffShiftTypeCard = ({
  staff,
  shift,
  options,
  isReadOnly,
  onToggle,
}: {
  staff: StaffType;
  shift: ShiftData | undefined;
  options: ShiftTypeOptionLike[];
  isReadOnly: boolean;
  onToggle: (option: ShiftTypeOptionLike) => void;
}) => {
  const requestedIds = getRequestedShiftTypeOptionIds(shift);
  return (
    <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="md" px={3} py={3}>
      <Flex align="center" gap={2}>
        <Avatar staff={staff} size={26} />
        <Text textStyle="sm" fontWeight={600} color={staff.isSubmitted ? "gray.800" : "gray.500"} flex={1}>
          {staff.name}
        </Text>
        <Flex gap={1} wrap="wrap" justify="flex-end" align="center">
          <Text textStyle="2xs" color="gray.500" fontWeight={600}>
            希望
          </Text>
          <RequestBadges staff={staff} requestedIds={requestedIds} options={options} />
        </Flex>
      </Flex>
      <SimpleGrid columns={2} gap={2} mt={3}>
        {options.map((option, index) => {
          const assigned = hasShiftTypeAssignment(shift, option.id);
          return (
            <ShiftTypeOptionButton
              key={option.id}
              staff={staff}
              option={option}
              optionColor={getShiftTypeOptionColor(index)}
              assigned={assigned}
              isReadOnly={isReadOnly}
              onToggle={() => onToggle(option)}
            />
          );
        })}
      </SimpleGrid>
    </Box>
  );
};

const RequestBadges = ({
  staff,
  requestedIds,
  options,
}: {
  staff: StaffType;
  requestedIds: string[];
  options: ShiftTypeOptionLike[];
}) => {
  if (!staff.isSubmitted) {
    return (
      <RequestBadge bg="#fef3c7" color="#b45309">
        未提出
      </RequestBadge>
    );
  }
  if (requestedIds.length === 0) {
    return (
      <RequestBadge bg="#dbeafe" color="#2563eb">
        休み
      </RequestBadge>
    );
  }
  const optionById = new Map(
    options.map((option, index) => [option.id, { option, color: getShiftTypeOptionColor(index) }]),
  );
  return requestedIds.map((optionId) => {
    const item = optionById.get(optionId);
    return (
      <RequestBadge key={optionId} bg={item?.color.requestedBg ?? "gray.100"} color={item?.color.accent ?? "gray.700"}>
        {item?.option.name ?? "勤務区分"}
      </RequestBadge>
    );
  });
};

const RequestBadge = ({ bg, color, children }: { bg: string; color: string; children: ReactNode }) => (
  <Box px={2} py="2px" borderRadius="full" textStyle="2xs" fontWeight={600} style={{ color, background: bg }}>
    {children}
  </Box>
);

const ShiftTypeOptionButton = ({
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
  <Box
    as="button"
    aria-label={`${staff.name} ${option.name} ${assigned ? "勤務あり" : "勤務なし"}`}
    aria-disabled={isReadOnly}
    onClick={isReadOnly ? undefined : onToggle}
    textAlign="left"
    px={3}
    py={2}
    borderWidth="1px"
    borderRadius="md"
    borderColor={assigned ? optionColor.accent : "gray.200"}
    bg={assigned ? optionColor.assignedBg : "white"}
    color={assigned ? optionColor.accent : "gray.600"}
    cursor={isReadOnly ? "default" : "pointer"}
    _active={isReadOnly ? undefined : { bg: assigned ? optionColor.headerBg : "gray.50" }}
  >
    <Flex align="center" gap={2}>
      <Text as="span" fontSize="lg" lineHeight={1} color={assigned ? optionColor.accent : "gray.400"}>
        {assigned ? "○" : "×"}
      </Text>
      <Box minW={0}>
        <Text textStyle="xs" fontWeight={700} truncate>
          {option.name}
        </Text>
        <Text textStyle="2xs" color={assigned ? optionColor.accent : "gray.500"} fontVariantNumeric="tabular-nums">
          {formatShiftTypeTimeRange(option)}
        </Text>
      </Box>
    </Flex>
  </Box>
);
