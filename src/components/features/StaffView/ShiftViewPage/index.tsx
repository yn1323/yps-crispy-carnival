import { Box, Flex, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import { getDateRange } from "@/src/domains/shift/date";
import type { ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";

const POSITIONS = [DEFAULT_POSITION];

type Assignment = {
  staffId: Id<"staffs">;
  date: string;
  startTime: string;
  endTime: string;
  positionId: Id<"positions">;
  optionId?: string | null;
};

type Props = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  shopClosedDates?: string[];
  submissionPattern?: ShiftSubmissionPattern;
  staffs: { _id: Id<"staffs">; name: string }[];
  positions: { _id: Id<"positions">; name: string; color: string; isDefault: boolean }[];
  assignments: Assignment[];
  timeRange: TimeRange;
};

function getShiftTypeOptionIdForAssignment(assignment: Assignment, pattern: ShiftSubmissionPattern | undefined) {
  if (pattern?.kind !== "shiftType") return undefined;
  if (assignment.optionId) return assignment.optionId;
  return pattern.options.find(
    (option) => option.startTime === assignment.startTime && option.endTime === assignment.endTime,
  )?.id;
}

function buildShiftData(
  staffs: StaffType[],
  dates: string[],
  assignments: Assignment[],
  positions: { _id: Id<"positions">; name: string; color: string; isDefault: boolean }[],
  submissionPattern: ShiftSubmissionPattern | undefined,
): ShiftData[] {
  const fallbackPosition = positions.find((position) => position.isDefault) ?? positions[0];
  const positionById = new Map(
    positions.map((position) => [position._id, { name: position.name, color: position.color }]),
  );
  const assignmentMap = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = `${a.staffId}-${a.date}`;
    const items = assignmentMap.get(key) ?? [];
    items.push(a);
    assignmentMap.set(key, items);
  }

  const shifts: ShiftData[] = [];
  for (const staff of staffs) {
    for (const date of dates) {
      const assignment = (assignmentMap.get(`${staff.id}-${date}`) ?? []).sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
      const positionSegments = assignment.map((item, index) => {
        const shiftTypeOptionId = getShiftTypeOptionIdForAssignment(item, submissionPattern);
        return {
          id: `seg-${staff.id}-${date}-${index}`,
          positionId: item.positionId,
          positionName: positionById.get(item.positionId)?.name ?? fallbackPosition?.name ?? DEFAULT_POSITION.name,
          color: positionById.get(item.positionId)?.color ?? fallbackPosition?.color ?? DEFAULT_POSITION.color,
          start: item.startTime,
          end: item.endTime,
          ...(shiftTypeOptionId ? { shiftTypeOptionId } : {}),
        };
      });
      const requestedTimes = assignment.map((item) => ({ start: item.startTime, end: item.endTime }));
      const requestedShiftTypeOptionIds =
        submissionPattern?.kind === "shiftType"
          ? positionSegments
              .map((position) => position.shiftTypeOptionId)
              .filter((optionId): optionId is string => !!optionId)
          : undefined;
      const mirrorsAssignmentAsRequest =
        submissionPattern?.kind === "dateOnly" || submissionPattern?.kind === "shiftType";
      shifts.push({
        id: `shift-${staff.id}-${date}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: mirrorsAssignmentAsRequest ? (requestedTimes[0] ?? null) : null,
        requestedTimes: mirrorsAssignmentAsRequest ? requestedTimes : undefined,
        requestedShiftTypeOptionIds,
        positions: positionSegments,
      });
    }
  }
  return shifts;
}

export function ShiftViewPage({
  periodLabel,
  periodStart,
  periodEnd,
  shopClosedDates = [],
  submissionPattern,
  staffs,
  positions,
  assignments,
  timeRange,
}: Props) {
  const dates = useMemo(() => getDateRange(periodStart, periodEnd), [periodStart, periodEnd]);

  const staffTypes: StaffType[] = useMemo(
    () => staffs.map((s) => ({ id: s._id, name: s.name, isSubmitted: true })),
    [staffs],
  );

  const displayPositions = useMemo(
    () =>
      positions.length > 0
        ? positions.map((position) => ({ id: position._id, name: position.name, color: position.color }))
        : POSITIONS,
    [positions],
  );

  const initialShifts = useMemo(
    () => buildShiftData(staffTypes, dates, assignments, positions, submissionPattern),
    [staffTypes, dates, assignments, positions, submissionPattern],
  );

  return (
    <Flex direction="column" h="full" minH={0}>
      <Box px={4} py={3}>
        <Text fontSize="sm" fontWeight="semibold">
          {periodLabel} のシフト
        </Text>
      </Box>

      <Box flex={1} minH={0} px={{ base: 0, lg: 4 }}>
        <ShiftForm
          shopId=""
          staffs={staffTypes}
          positions={displayPositions}
          initialShifts={initialShifts}
          dates={dates}
          timeRange={timeRange}
          holidays={shopClosedDates}
          submissionPattern={submissionPattern}
          displayMode="confirmed"
          isReadOnly
        />
      </Box>
    </Flex>
  );
}
