import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDialog } from "@/src/components/ui/Dialog";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import { computeVisualBreaks } from "@/src/domains/shift/operations";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionSegment, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";
import {
  DateIssueBadge,
  dateIssueBorderColor,
  IssueDot,
  issueToneEmphasis,
  resolveIssueTone,
  StaffWarningIcon,
} from "../../components";
import { BREAK_POSITION } from "../../constants";
import {
  issueCountByDateAtom,
  issueStaffIdSetForSelectedDateAtom,
  selectedDateAtom,
  shiftByStaffIdForSelectedDateAtom,
  shiftConfigAtom,
  shiftsAtom,
  sortedStaffsAtom,
  warningCountByDateAtom,
  warningMessagesByStaffIdForSelectedDateAtom,
} from "../../stores";
import { ShiftDetailSheet } from "./ShiftDetailSheet";
import { ShiftEditSheet } from "./ShiftEditSheet";

const isBreakSegment = (pos: PositionSegment) =>
  pos.positionName === BREAK_POSITION.name || pos.positionId === BREAK_POSITION.id;

const STRIPE_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, #9CA3AF, #9CA3AF 3px, transparent 3px, transparent 6px)",
};

const SWIPE_THRESHOLD = 50;

const dayColor = (iso: string): string => {
  const day = dayjs(iso).day();
  if (day === 0) return "#ef4444";
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
  const setShifts = useSetAtom(shiftsAtom);
  const sortedStaffs = useAtomValue(sortedStaffsAtom);
  const shiftByStaffId = useAtomValue(shiftByStaffIdForSelectedDateAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const issueStaffIds = useAtomValue(issueStaffIdSetForSelectedDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const warningMessagesByStaffId = useAtomValue(warningMessagesByStaffIdForSelectedDateAtom);

  const { positions, dates, timeRange, isReadOnly, holidays } = config;
  const isShopClosedDate = holidays.includes(selectedDate);

  const editDialog = useDialog();
  const detailDialog = useDialog();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const touchStartX = useRef(0);

  const rows = useMemo(
    () =>
      sortedStaffs.map((staff) => ({
        staff,
        shift: shiftByStaffId.get(staff.id),
      })),
    [sortedStaffs, shiftByStaffId],
  );

  const workRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.shift?.requestedTime || (r.shift?.requestedTimes?.length ?? 0) > 0 || (r.shift?.positions.length ?? 0) > 0,
      ),
    [rows],
  );
  const offRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          !r.shift?.requestedTime &&
          (r.shift?.requestedTimes?.length ?? 0) === 0 &&
          (r.shift?.positions.length ?? 0) === 0,
      ),
    [rows],
  );

  const selectedStaff = useMemo(
    () => sortedStaffs.find((s) => s.id === selectedStaffId),
    [sortedStaffs, selectedStaffId],
  );
  const selectedShift = useMemo(
    () => (selectedStaffId ? shiftByStaffId.get(selectedStaffId) : undefined),
    [shiftByStaffId, selectedStaffId],
  );

  const handleCardTap = useCallback(
    (staffId: string) => {
      if (isShopClosedDate) return;
      setSelectedStaffId(staffId);
      if (isReadOnly) {
        detailDialog.open();
      } else {
        editDialog.open();
      }
    },
    [isShopClosedDate, isReadOnly, detailDialog, editDialog],
  );

  const handleStaffDialogOpenChange = useCallback(
    (details: { open: boolean }) => {
      const dialog = isReadOnly ? detailDialog : editDialog;
      dialog.onOpenChange(details);
      if (!details.open) {
        setSelectedStaffId(null);
      }
    },
    [isReadOnly, detailDialog, editDialog],
  );

  const handleShiftUpdate = useCallback(
    (updatedShift: ShiftData) => {
      setShifts((current) => {
        const exists = current.some((s) => s.id === updatedShift.id);
        return exists ? current.map((s) => (s.id === updatedShift.id ? updatedShift : s)) : [...current, updatedShift];
      });
    },
    [setShifts],
  );

  const handleShiftDelete = useCallback(
    (staffId: string) => {
      setShifts((current) =>
        current.map((s) => (s.staffId === staffId && s.date === selectedDate ? { ...s, positions: [] } : s)),
      );
    },
    [selectedDate, setShifts],
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
      <Box
        px={3}
        pt={3}
        pb={2}
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.100"
        flexShrink={0}
        data-tour="date-rail"
      >
        <Flex gap={2} overflow="auto" pt={2} pb={1}>
          {dates.map((iso) => {
            const d = dayjs(iso);
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
                onClick={() => setSelectedDate(iso)}
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
                  {d.date()}
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

      {/* 日付タイトル */}
      {sd && (
        <Box px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
          <Flex align="baseline" gap={2}>
            <Box textStyle="xl" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
              {sd.month() + 1}月{sd.date()}日
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

      {/* セクション */}
      <Box flex={1} minH={0} overflow="auto" bg="gray.50" px={3} py={3} data-tour="shift-grid">
        {isShopClosedDate ? (
          <Flex minH="240px" align="center" justify="center" direction="column" gap={2} px={4}>
            <Box textStyle="md" fontWeight={700} color="gray.700">
              定休日
            </Box>
            <Box textStyle="sm" color="fg.muted" textAlign="center" lineHeight={1.7}>
              この日はお店のお休みとして設定されているため、シフトは登録できません。
            </Box>
          </Flex>
        ) : (
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
                      hasError={issueStaffIds.has(staff.id)}
                      warningMessages={warningMessagesByStaffId.get(staff.id) ?? []}
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
                      hasError={issueStaffIds.has(staff.id)}
                      warningMessages={warningMessagesByStaffId.get(staff.id) ?? []}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Box>

      {/* Dialogs */}
      {isReadOnly && selectedStaff && (
        <ShiftDetailSheet
          staff={selectedStaff}
          shift={selectedShift}
          selectedDate={selectedDate}
          isOpen={detailDialog.isOpen}
          onOpenChange={handleStaffDialogOpenChange}
        />
      )}

      {!isReadOnly && selectedStaff && (
        <ShiftEditSheet
          staff={selectedStaff}
          shift={selectedShift}
          positions={positions}
          timeRange={timeRange}
          selectedDate={selectedDate}
          isOpen={editDialog.isOpen}
          onOpenChange={handleStaffDialogOpenChange}
          onShiftUpdate={handleShiftUpdate}
          onShiftDelete={handleShiftDelete}
        />
      )}
    </Flex>
  );
};

const SectionHeader = ({ label, count, hint }: { label: string; count: number; hint?: string }) => (
  <Flex align="baseline" gap={2} mb={2} px={1}>
    <Box textStyle="caption" fontWeight={700} color="gray.600" letterSpacing="0.04em">
      {label}
    </Box>
    <Box textStyle="caption" color="gray.400" fontWeight={600}>
      {count}
    </Box>
    {hint && (
      <Box textStyle="2xs" color="gray.400" ml="auto">
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
      // Avatar initials scale with the configured avatar box size.
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
  hasError?: boolean;
  warningMessages?: string[];
};

const SPDailyCard = ({ staff, shift, timeRange, onTap, hasError = false, warningMessages = [] }: CardProps) => {
  const requestedTimes = shift?.requestedTimes ?? (shift?.requestedTime ? [shift.requestedTime] : []);
  const hasReq = requestedTimes.length > 0;
  const asn = getAssignedRange(shift);
  const hasAsn = !!asn;
  const mismatch = hasReq && !hasAsn;
  const tone = resolveIssueTone(hasError, false);
  const emphasis = issueToneEmphasis(tone);
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
      role="button"
      tabIndex={0}
      aria-label={`${staff.name}の勤務を編集`}
      onClick={onTap}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onTap();
        }
      }}
      data-tour={`shift-row-${staff.id}`}
      w="100%"
      textAlign="left"
      bg={emphasis?.bg ?? "white"}
      borderRadius="lg"
      borderWidth={emphasis ? "2px" : "1px"}
      borderColor={emphasis?.border ?? (mismatch ? "orange.200" : "gray.200")}
      px={3}
      py="10px"
      cursor="pointer"
      _active={{ bg: "gray.50" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      <Flex align="center" gap={2} mb={2}>
        {tone && <IssueDot tone={tone} />}
        <Avatar staff={staff} size={28} />
        <Box textStyle="sm" fontWeight={600} color="gray.800" flex={1}>
          {staff.name}
        </Box>
        <StaffWarningIcon messages={warningMessages} />
        {mismatch && (
          <Box
            textStyle="2xs"
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
          <Box textStyle="caption" fontWeight={700} color="teal.700" fontVariantNumeric="tabular-nums">
            {formatShiftClockTime(asn[0])}–{formatShiftClockTime(asn[1])}
          </Box>
        )}
        {!hasReq && !hasAsn && staff.isSubmitted && (
          <Box textStyle="2xs" color="gray.400">
            休み
          </Box>
        )}
      </Flex>
      <Box position="relative" h="22px" bg="gray.50" borderRadius="md">
        {requestedTimes.map((request, index) => (
          <Box
            key={`${request.start}-${request.end}-${index}`}
            position="absolute"
            top={0}
            bottom={0}
            left={`${timeToPct(request.start, timeRange)}%`}
            w={`${timeToPct(request.end, timeRange) - timeToPct(request.start, timeRange)}%`}
            border="1.5px dashed #a1a1aa"
            borderRadius="md"
          />
        ))}
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

const SPOffCard = ({
  staff,
  onTap,
  isReadOnly,
  hasError = false,
  warningMessages = [],
}: {
  staff: StaffType;
  onTap: () => void;
  isReadOnly: boolean;
  hasError?: boolean;
  warningMessages?: string[];
}) => {
  const isUnsub = !staff.isSubmitted;
  const offLabel = isUnsub ? "未提出" : isReadOnly ? "休み" : "休み希望";
  const tone = resolveIssueTone(hasError, false);
  const emphasis = issueToneEmphasis(tone);
  return (
    <Box
      role={isReadOnly ? undefined : "button"}
      tabIndex={isReadOnly ? undefined : 0}
      aria-label={isReadOnly ? undefined : `${staff.name}の勤務を追加`}
      onClick={isReadOnly ? undefined : onTap}
      onKeyDown={
        isReadOnly
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onTap();
              }
            }
      }
      data-tour={`shift-row-${staff.id}`}
      w="100%"
      display="flex"
      alignItems="center"
      gap="10px"
      p="10px 12px"
      bg={emphasis?.bg ?? "white"}
      borderWidth={emphasis ? "2px" : "1px"}
      borderColor={emphasis?.border ?? "gray.200"}
      borderRadius="md"
      cursor={isReadOnly ? "default" : "pointer"}
      textAlign="left"
      _active={isReadOnly ? undefined : { bg: "gray.50" }}
      _focusVisible={isReadOnly ? undefined : { outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      {tone && <IssueDot tone={tone} />}
      <Avatar staff={staff} size={24} />
      <Box textStyle="sm" fontWeight={600} color="gray.600" flex={1}>
        {staff.name}
      </Box>
      <StaffWarningIcon messages={warningMessages} />
      <Box textStyle="2xs" fontWeight={600} style={{ color: isUnsub ? "#b45309" : "#a1a1aa" }}>
        {offLabel}
      </Box>
      {!isReadOnly && (
        <Box fontSize="lg" color="gray.400" lineHeight={1} ml="4px">
          ＋
        </Box>
      )}
    </Box>
  );
};
