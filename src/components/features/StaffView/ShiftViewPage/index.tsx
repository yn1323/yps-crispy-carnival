import { Box, Flex } from "@chakra-ui/react";
import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { DEFAULT_POSITION } from "@/src/components/features/Shift/ShiftForm/constants";
import type { ShiftData, StaffType } from "@/src/components/features/Shift/ShiftForm/types";
import { getDateRange } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { PeriodBar } from "../PeriodBar";

const POSITIONS = [DEFAULT_POSITION];

type Assignment = {
  staffId: Id<"staffs">;
  date: string;
  startTime: string;
  endTime: string;
};

type Props = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  staffs: { _id: Id<"staffs">; name: string }[];
  assignments: Assignment[];
  timeRange: { start: number; end: number; unit: number };
};

function buildShiftData(staffs: StaffType[], dates: string[], assignments: Assignment[]): ShiftData[] {
  const assignmentMap = new Map<string, Assignment>();
  for (const a of assignments) {
    assignmentMap.set(`${a.staffId}-${a.date}`, a);
  }

  const shifts: ShiftData[] = [];
  for (const staff of staffs) {
    for (const date of dates) {
      const assignment = assignmentMap.get(`${staff.id}-${date}`);
      shifts.push({
        id: `shift-${staff.id}-${date}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: null,
        positions: assignment
          ? [
              {
                id: `seg-${staff.id}-${date}`,
                positionId: DEFAULT_POSITION.id,
                positionName: DEFAULT_POSITION.name,
                color: DEFAULT_POSITION.color,
                start: assignment.startTime,
                end: assignment.endTime,
              },
            ]
          : [],
      });
    }
  }
  return shifts;
}

export function ShiftViewPage({ periodLabel, periodStart, periodEnd, staffs, assignments, timeRange }: Props) {
  const dates = useMemo(() => getDateRange(periodStart, periodEnd), [periodStart, periodEnd]);

  const staffTypes: StaffType[] = useMemo(
    () => staffs.map((s) => ({ id: s._id, name: s.name, isSubmitted: true })),
    [staffs],
  );

  const initialShifts = useMemo(() => buildShiftData(staffTypes, dates, assignments), [staffTypes, dates, assignments]);

  return (
    <Flex direction="column" h="full" minH={0}>
      <PeriodBar periodLabel={periodLabel} />

      <Box flex={1} minH={0} px={{ base: 0, lg: 4 }}>
        <ShiftForm
          shopId=""
          staffs={staffTypes}
          positions={POSITIONS}
          initialShifts={initialShifts}
          dates={dates}
          timeRange={timeRange}
          isReadOnly
        />
      </Box>
    </Flex>
  );
}
