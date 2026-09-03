import type { Id } from "@/convex/_generated/dataModel";
import { canonicalizeTimeAssignments } from "@/src/domains/shift/buildAssignments";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import { resolveDisplayShiftLine } from "@/src/domains/shift/resolveDisplayShiftLine";
import { minutesToTime } from "@/src/domains/shift/time";
import type { ShiftData, ShiftTimeRange, StaffType } from "@/src/domains/shift/types";
import type { ShiftBoardData } from "../types";

type ShiftRequestRange = { startTime: string; endTime: string; optionId: string | null };

const compareRequestRanges = (a: ShiftRequestRange, b: ShiftRequestRange): number =>
  a.startTime.localeCompare(b.startTime) ||
  a.endTime.localeCompare(b.endTime) ||
  (a.optionId ?? "").localeCompare(b.optionId ?? "");

const compareAssignments = (
  a: { startTime: string; endTime: string; positionId: Id<"positions">; optionId: string | null },
  b: { startTime: string; endTime: string; positionId: Id<"positions">; optionId: string | null },
): number =>
  a.startTime.localeCompare(b.startTime) ||
  a.endTime.localeCompare(b.endTime) ||
  String(a.positionId).localeCompare(String(b.positionId)) ||
  (a.optionId ?? "").localeCompare(b.optionId ?? "");

const getRequestSpan = (requests: ShiftRequestRange[]): ShiftRequestRange | undefined => {
  if (requests.length === 0) return undefined;
  const sorted = [...requests].sort(compareRequestRanges);
  return {
    startTime: sorted[0].startTime,
    endTime: sorted.reduce(
      (latest, request) => (request.endTime > latest ? request.endTime : latest),
      sorted[0].endTime,
    ),
    optionId: sorted.length === 1 ? sorted[0].optionId : null,
  };
};

const toShiftTimeRange = (request: ShiftRequestRange): ShiftTimeRange => ({
  start: request.startTime,
  end: request.endTime,
});

const getShiftTypeOptionIdForRange = (
  request: ShiftRequestRange,
  options: Array<{ id: string; startTime: string; endTime: string }>,
): string | undefined => {
  if (request.optionId) return request.optionId;
  return options.find((option) => option.startTime === request.startTime && option.endTime === request.endTime)?.id;
};

/** ConvexデータをShiftForm用の表示データへ決定的に変換する。 */
export const buildShiftData = (data: ShiftBoardData, staffs: StaffType[], dates: string[]): ShiftData[] => {
  const shopClosedDateSet = new Set(data.recruitment.shopClosedDates);
  const positions = data.positions;
  const defaultPosition = positions.find((position) => position.isDefault);
  const fallbackPosition = defaultPosition
    ? { id: defaultPosition._id, name: defaultPosition.name, color: defaultPosition.color }
    : DEFAULT_POSITION;
  const positionById = new Map(
    positions.map((position) => [position._id, { id: position._id, name: position.name, color: position.color }]),
  );

  const requestMap = new Map<string, ShiftRequestRange[]>();
  for (const request of data.requestedSlots) {
    const key = `${request.staffId}-${request.date}`;
    const requests = requestMap.get(key) ?? [];
    requests.push({
      startTime: request.startTime,
      endTime: request.endTime,
      optionId: request.optionId ?? null,
    });
    requestMap.set(key, requests);
  }
  const requestedDateSet = new Set(data.requestedDates.map((request) => `${request.staffId}-${request.date}`));
  const fullDayRequest: ShiftRequestRange = {
    startTime: minutesToTime(data.timeRange.editableStartMinutes ?? data.timeRange.start * 60),
    endTime: minutesToTime(data.timeRange.editableEndMinutes ?? data.timeRange.end * 60),
    optionId: null,
  };

  const assignmentMap = new Map<
    string,
    Array<{ startTime: string; endTime: string; positionId: Id<"positions">; optionId: string | null }>
  >();
  const displayAssignments =
    data.submissionPattern.kind === "time"
      ? canonicalizeTimeAssignments(data.shiftAssignments, defaultPosition?._id)
      : data.shiftAssignments;
  for (const assignment of displayAssignments) {
    const key = `${assignment.staffId}-${assignment.date}`;
    const assignments = assignmentMap.get(key) ?? [];
    assignments.push({
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      positionId: assignment.positionId,
      optionId: assignment.optionId ?? null,
    });
    assignmentMap.set(key, assignments);
  }
  const wasSubmittedAtDraftMap = new Map(data.staffs.map((staff) => [staff._id, staff.wasSubmittedAtDraft]));

  const shifts: ShiftData[] = [];

  for (const staff of staffs) {
    for (const date of dates) {
      if (shopClosedDateSet.has(date)) {
        shifts.push({
          id: `shift-${staff.id}-${date}`,
          staffId: staff.id,
          staffName: staff.name,
          date,
          requestedTime: null,
          positions: [],
        });
        continue;
      }

      const key = `${staff.id}-${date}`;
      const assignments = [...(assignmentMap.get(key) ?? [])].sort(compareAssignments);
      const requests = [...(requestMap.get(key) ?? [])].sort(compareRequestRanges);
      const shiftTypeOptions = data.submissionPattern.kind === "shiftType" ? data.submissionPattern.options : [];
      const requestedShiftTypeOptionIds =
        data.submissionPattern.kind === "shiftType"
          ? requests
              .map((request) => getShiftTypeOptionIdForRange(request, shiftTypeOptions))
              .filter((optionId): optionId is string => !!optionId)
          : undefined;
      const request = getRequestSpan(requests) ?? (requestedDateSet.has(key) ? fullDayRequest : undefined);
      const requestedTimes =
        requests.length > 0
          ? requests.map(toShiftTimeRange)
          : requestedDateSet.has(key)
            ? [toShiftTimeRange(fullDayRequest)]
            : undefined;
      const savedAssignment =
        assignments.length > 0
          ? {
              startTime: assignments[0].startTime,
              endTime: assignments.reduce(
                (latest, assignment) => (assignment.endTime > latest ? assignment.endTime : latest),
                assignments[0].endTime,
              ),
            }
          : undefined;
      const isShiftTypePattern = data.submissionPattern.kind === "shiftType";
      const displayLine = resolveDisplayShiftLine({
        hasDraftSaved: data.recruitment.draftSavedAt !== null,
        savedAssignment,
        wasSubmittedAtDraft: wasSubmittedAtDraftMap.get(staff.id as Id<"staffs">) ?? false,
        currentRequest: request,
      });
      const positionSegments =
        assignments.length > 0
          ? assignments.map((assignment, index) => {
              const position = positionById.get(assignment.positionId) ?? fallbackPosition;
              const shiftTypeOptionId = isShiftTypePattern
                ? getShiftTypeOptionIdForRange(assignment, shiftTypeOptions)
                : undefined;
              return {
                id: `seg-${staff.id}-${date}-${index}`,
                positionId: position.id,
                positionName: position.name,
                color: position.color,
                start: assignment.startTime,
                end: assignment.endTime,
                shiftTypeOptionId,
              };
            })
          : isShiftTypePattern && displayLine.type === "request" && requests.length > 0
            ? requests.flatMap((request, index) => {
                const shiftTypeOptionId = getShiftTypeOptionIdForRange(request, shiftTypeOptions);
                if (!shiftTypeOptionId) return [];
                return [
                  {
                    id: `seg-${staff.id}-${date}-${index}`,
                    positionId: fallbackPosition.id,
                    positionName: fallbackPosition.name,
                    color: fallbackPosition.color,
                    start: request.startTime,
                    end: request.endTime,
                    shiftTypeOptionId,
                  },
                ];
              })
            : !isShiftTypePattern && displayLine.type === "request" && requests.length > 0
              ? requests.map((request, index) => ({
                  id: `seg-${staff.id}-${date}-${index}`,
                  positionId: fallbackPosition.id,
                  positionName: fallbackPosition.name,
                  color: fallbackPosition.color,
                  start: request.startTime,
                  end: request.endTime,
                }))
              : !isShiftTypePattern && displayLine.type !== "none"
                ? [
                    {
                      id: `seg-${staff.id}-${date}`,
                      positionId: fallbackPosition.id,
                      positionName: fallbackPosition.name,
                      color: fallbackPosition.color,
                      start: displayLine.start,
                      end: displayLine.end,
                    },
                  ]
                : [];

      shifts.push({
        id: `shift-${staff.id}-${date}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: request ? { start: request.startTime, end: request.endTime } : null,
        requestedTimes,
        requestedShiftTypeOptionIds,
        positions: positionSegments,
      });
    }
  }

  return shifts;
};
