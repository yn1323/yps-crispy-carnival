import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { useBottomSheet } from "@/src/components/ui/BottomSheet";
import { BREAK_POSITION } from "../../constants";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, sortedStaffsAtom } from "../../stores";
import type { PositionSegment, ShiftData, StaffType, TimeRange } from "../../types";
import { getWeekdayLabel } from "../../utils/dateUtils";
import { computeVisualBreaks } from "../../utils/shiftOperations";
import { timeToMinutes } from "../../utils/timeConversion";
import { ShiftDetailSheet } from "./ShiftDetailSheet";
import { ShiftEditSheet } from "./ShiftEditSheet";

const isBreakSegment = (pos: PositionSegment) =>
  pos.positionName === BREAK_POSITION.name || pos.positionId === BREAK_POSITION.id;

const STRIPE_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 3px, transparent 3px, transparent 6px)",
};

const SWIPE_THRESHOLD = 50;

const dayColor = (iso: string, holidays: string[]): string => {
  const day = dayjs(iso).day();
  if (day === 0 || holidays.includes(iso)) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

const timeToPct = (t: string, timeRange: TimeRange): number => {
  const [h, m] = t.split(":").map(Number);
  const totalMin = (timeRange.end - timeRange.start) * 60;
  return (((h - timeRange.start) * 60 + m) / totalMin) * 100;
};

const getAssignedRange = (shift: ShiftData | undefined): [string, string] | null => {
  if (!shift || shift.positions.length === 0) return null;
  const work = shift.positions.filter((p) => !isBreakSegment(p));
  if (work.length === 0) return null;
  const sorted = [...work].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return [sorted[0].start, sorted[sorted.length - 1].end];
};

export const SPDailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShifts = useSetAtom(shiftsAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);

  const { positions, dates, timeRange, isReadOnly, holidays } = config;

  const editSheet = useBottomSheet();
  const detailSheet = useBottomSheet();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const touchStartX = useRef(0);

  const dateShifts = useMemo(() => shifts.filter((s) => s.date === selectedDate), [shifts, selectedDate]);

  const rows = useMemo(
    () =>
      sortedStaffs.map((staff) => ({
        staff,
        shift: dateShifts.find((s) => s.staffId === staff.id),
      })),
    [sortedStaffs, dateShifts],
  );

  const workRows = useMemo(
    () => rows.filter((r) => r.shift?.requestedTime || (r.shift?.positions.length ?? 0) > 0),
    [rows],
  );
  const offRows = useMemo(
    () => rows.filter((r) => !r.shift?.requestedTime && (r.shift?.positions.length ?? 0) === 0),
    [rows],
  );

  const selectedStaff = useMemo(
    () => sortedStaffs.find((s) => s.id === selectedStaffId),
    [sortedStaffs, selectedStaffId],
  );
  const selectedShift = useMemo(
    () => dateShifts.find((s) => s.staffId === selectedStaffId),
    [dateShifts, selectedStaffId],
  );

  const handleCardTap = useCallback(
    (staffId: string) => {
      setSelectedStaffId(staffId);
      if (isReadOnly) {
        detailSheet.open();
      } else {
        editSheet.open();
      }
    },
    [isReadOnly, detailSheet, editSheet],
  );

  const handleShiftUpdate = useCallback(
    (updatedShift: ShiftData) => {
      const exists = shifts.some((s) => s.id === updatedShift.id);
      if (exists) {
        setShifts(shifts.map((s) => (s.id === updatedShift.id ? updatedShift : s)));
      } else {
        setShifts([...shifts, updatedShift]);
      }
    },
    [shifts, setShifts],
  );

  const handleShiftDelete = useCallback(
    (staffId: string) => {
      const target = shifts.find((s) => s.staffId === staffId && s.date === selectedDate);
      if (target) {
        setShifts(shifts.map((s) => (s.id === target.id ? { ...s, positions: [] } : s)));
      }
    },
    [shifts, selectedDate, setShifts],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
      const currentIndex = dates.indexOf(selectedDate);
      if (deltaX > 0 && currentIndex > 0) {
        setSelectedDate(dates[currentIndex - 1]);
      } else if (deltaX < 0 && currentIndex < dates.length - 1) {
        setSelectedDate(dates[currentIndex + 1]);
      }
    },
    [dates, selectedDate, setSelectedDate],
  );

  const sd = selectedDate ? dayjs(selectedDate) : null;

  return (
    <Flex direction="column" flex={1} minH={0} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* 日付ピッカー（横スクロール） */}
      <Box px={3} pt={3} pb={2} bg="white" borderBottomWidth="1px" borderColor="gray.100" flexShrink={0}>
        <Flex gap={2} overflow="auto" pb={1}>
          {dates.map((iso) => {
            const d = dayjs(iso);
            const active = iso === selectedDate;
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
                bg={active ? "teal.50" : "white"}
                cursor="pointer"
              >
                <Box
                  fontSize="16px"
                  fontWeight={700}
                  color={active ? "teal.700" : "gray.800"}
                  lineHeight="1.1"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {d.date()}
                </Box>
                <Box
                  fontSize="10px"
                  mt="2px"
                  fontWeight={active ? 700 : 500}
                  style={{ color: dayColor(iso, holidays) }}
                >
                  {getWeekdayLabel(iso)}
                </Box>
              </Box>
            );
          })}
        </Flex>
      </Box>

      {/* 日付タイトル */}
      {sd && (
        <Box px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
          <Flex align="baseline" gap={2}>
            <Box fontSize="20px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
              {sd.month() + 1}月{sd.date()}日
            </Box>
            <Box fontSize="13px" fontWeight={600} style={{ color: dayColor(selectedDate, holidays) }}>
              ({getWeekdayLabel(selectedDate)})
            </Box>
          </Flex>
        </Box>
      )}

      {/* セクション */}
      <Box flex={1} minH={0} overflow="auto" bg="gray.50" px={3} py={3}>
        <Stack gap={4}>
          {workRows.length > 0 && (
            <Box>
              <SectionHeader label="出勤あり" count={workRows.length} />
              <Stack gap={2}>
                {workRows.map(({ staff, shift }) => (
                  <SPDailyCard
                    key={staff.id}
                    staff={staff}
                    shift={shift}
                    timeRange={timeRange}
                    onTap={() => handleCardTap(staff.id)}
                  />
                ))}
              </Stack>
            </Box>
          )}
          {offRows.length > 0 && (
            <Box>
              <SectionHeader
                label="希望なし・未提出"
                count={offRows.length}
                hint={isReadOnly ? undefined : "タップで追加"}
              />
              <Stack gap="6px">
                {offRows.map(({ staff }) => (
                  <SPOffCard
                    key={staff.id}
                    staff={staff}
                    onTap={() => handleCardTap(staff.id)}
                    isReadOnly={isReadOnly}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>

      {/* Sheets */}
      {isReadOnly && selectedStaff && (
        <ShiftDetailSheet
          staff={selectedStaff}
          shift={selectedShift}
          selectedDate={selectedDate}
          isOpen={detailSheet.isOpen}
          onOpenChange={detailSheet.onOpenChange}
        />
      )}

      {!isReadOnly && selectedStaff && (
        <ShiftEditSheet
          staff={selectedStaff}
          shift={selectedShift}
          positions={positions}
          timeRange={timeRange}
          selectedDate={selectedDate}
          isOpen={editSheet.isOpen}
          onOpenChange={editSheet.onOpenChange}
          onShiftUpdate={handleShiftUpdate}
          onShiftDelete={handleShiftDelete}
        />
      )}
    </Flex>
  );
};

const SectionHeader = ({ label, count, hint }: { label: string; count: number; hint?: string }) => (
  <Flex align="baseline" gap={2} mb={2} px={1}>
    <Box fontSize="11px" fontWeight={700} color="gray.600" letterSpacing="0.04em">
      {label}
    </Box>
    <Box fontSize="11px" color="gray.400" fontWeight={600}>
      {count}
    </Box>
    {hint && (
      <Box fontSize="10px" color="gray.400" ml="auto">
        {hint}
      </Box>
    )}
  </Flex>
);

const Avatar = ({ staff, size = 28 }: { staff: StaffType; size?: number }) => (
  <Box
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "#f4f4f5",
      color: "#52525b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: Math.round(size * 0.42),
      fontWeight: 600,
      flexShrink: 0,
    }}
  >
    {staff.name.slice(0, 1)}
  </Box>
);

type CardProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  timeRange: TimeRange;
  onTap: () => void;
};

const SPDailyCard = ({ staff, shift, timeRange, onTap }: CardProps) => {
  const hasReq = !!shift?.requestedTime;
  const asn = getAssignedRange(shift);
  const hasAsn = !!asn;
  const mismatch = hasReq && !hasAsn;
  const workPositions = useMemo<PositionSegment[]>(
    () =>
      shift
        ? [...shift.positions]
            .filter((p) => !isBreakSegment(p))
            .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
        : [],
    [shift],
  );
  const breaks = useMemo(() => (workPositions.length >= 2 ? computeVisualBreaks(workPositions) : []), [workPositions]);

  return (
    <Box
      as="button"
      onClick={onTap}
      w="100%"
      textAlign="left"
      bg="white"
      borderRadius="lg"
      borderWidth="1px"
      borderColor={mismatch ? "orange.200" : "gray.200"}
      px={3}
      py="10px"
      cursor="pointer"
      _active={{ bg: "gray.50" }}
    >
      <Flex align="center" gap={2} mb={2}>
        <Avatar staff={staff} size={28} />
        <Box fontSize="13px" fontWeight={600} color="gray.800" flex={1}>
          {staff.name}
        </Box>
        {mismatch && (
          <Box
            fontSize="10px"
            fontWeight={700}
            px={2}
            py="1px"
            style={{
              color: "#b45309",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 999,
            }}
          >
            希望あり
          </Box>
        )}
        {hasAsn && asn && (
          <Box fontSize="11px" fontWeight={700} color="teal.700" style={{ fontVariantNumeric: "tabular-nums" }}>
            {asn[0]}–{asn[1]}
          </Box>
        )}
        {!hasReq && !hasAsn && staff.isSubmitted && (
          <Box fontSize="10px" color="gray.400">
            休み
          </Box>
        )}
      </Flex>
      <Box position="relative" h="22px" bg="gray.50" borderRadius="md">
        {hasReq && shift?.requestedTime && (
          <Box
            position="absolute"
            top={0}
            bottom={0}
            left={`${timeToPct(shift.requestedTime.start, timeRange)}%`}
            w={`${timeToPct(shift.requestedTime.end, timeRange) - timeToPct(shift.requestedTime.start, timeRange)}%`}
            border="1.5px dashed #a1a1aa"
            borderRadius="md"
          />
        )}
        {workPositions.map((pos) => (
          <Box
            key={pos.id}
            position="absolute"
            top="3px"
            bottom="3px"
            left={`${timeToPct(pos.start, timeRange)}%`}
            w={`${timeToPct(pos.end, timeRange) - timeToPct(pos.start, timeRange)}%`}
            bg="teal.500"
            borderRadius="sm"
          />
        ))}
        {breaks.map((gap) => (
          <Box
            key={`break-${gap.start}-${gap.end}`}
            position="absolute"
            top="3px"
            bottom="3px"
            left={`${timeToPct(gap.start, timeRange)}%`}
            w={`${timeToPct(gap.end, timeRange) - timeToPct(gap.start, timeRange)}%`}
            opacity={0.6}
            style={STRIPE_STYLE}
          />
        ))}
      </Box>
    </Box>
  );
};

const SPOffCard = ({ staff, onTap, isReadOnly }: { staff: StaffType; onTap: () => void; isReadOnly: boolean }) => {
  const isUnsub = !staff.isSubmitted;
  return (
    <Box
      as="button"
      onClick={isReadOnly ? undefined : onTap}
      w="100%"
      display="flex"
      alignItems="center"
      gap="10px"
      p="10px 12px"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="md"
      cursor={isReadOnly ? "default" : "pointer"}
      textAlign="left"
      _active={isReadOnly ? undefined : { bg: "gray.50" }}
    >
      <Avatar staff={staff} size={24} />
      <Box fontSize="13px" fontWeight={600} color="gray.600" flex={1}>
        {staff.name}
      </Box>
      <Box fontSize="10px" fontWeight={600} style={{ color: isUnsub ? "#b45309" : "#a1a1aa" }}>
        {isUnsub ? "未提出" : "休み希望"}
      </Box>
      {!isReadOnly && (
        <Box fontSize="18px" color="gray.400" lineHeight={1} ml="4px">
          ＋
        </Box>
      )}
    </Box>
  );
};
