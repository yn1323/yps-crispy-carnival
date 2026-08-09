import { isSupportedShiftTime, timeToMinutes } from "./time";
import { isValidIsoDateString } from "./validation";

export type NormalizableShiftAssignment = {
  staffId?: string;
  date: string;
  startTime: string;
  endTime: string;
  positionId: string;
  optionId?: string;
};

type IndexedAssignment<T> = { assignment: T; index: number };

function staffDateKey(assignment: NormalizableShiftAssignment): string {
  return JSON.stringify([assignment.staffId ?? null, assignment.date]);
}

/**
 * 時間入力方式の完全隣接だけを統合する。
 * 不正・重複・option付きのstaff/dateは一部だけを直さず、元の形で残す。
 */
export function normalizeExactAdjacentTimeAssignments<T extends NormalizableShiftAssignment>(
  assignments: readonly T[],
): T[] {
  const staffDateGroups = new Map<string, Array<IndexedAssignment<T>>>();
  assignments.forEach((assignment, index) => {
    const key = staffDateKey(assignment);
    const group = staffDateGroups.get(key) ?? [];
    group.push({ assignment, index });
    staffDateGroups.set(key, group);
  });

  const output: Array<IndexedAssignment<T>> = [];
  for (const staffDateGroup of staffDateGroups.values()) {
    if (
      staffDateGroup.some(
        ({ assignment }) =>
          !isValidIsoDateString(assignment.date) ||
          assignment.optionId !== undefined ||
          !isSupportedShiftTime(assignment.startTime) ||
          !isSupportedShiftTime(assignment.endTime) ||
          timeToMinutes(assignment.startTime) >= timeToMinutes(assignment.endTime),
      )
    ) {
      output.push(...staffDateGroup);
      continue;
    }

    const ranges = staffDateGroup
      .slice()
      .sort(
        (left, right) =>
          timeToMinutes(left.assignment.startTime) - timeToMinutes(right.assignment.startTime) ||
          timeToMinutes(left.assignment.endTime) - timeToMinutes(right.assignment.endTime) ||
          left.index - right.index,
      );
    let latestEnd = Number.NEGATIVE_INFINITY;
    let hasOverlap = false;
    for (const range of ranges) {
      const start = timeToMinutes(range.assignment.startTime);
      if (start < latestEnd) {
        hasOverlap = true;
        break;
      }
      latestEnd = Math.max(latestEnd, timeToMinutes(range.assignment.endTime));
    }
    if (hasOverlap) {
      output.push(...staffDateGroup);
      continue;
    }

    const groupsByPosition = new Map<string, Array<IndexedAssignment<T>>>();
    for (const entry of ranges) {
      const group = groupsByPosition.get(entry.assignment.positionId) ?? [];
      group.push(entry);
      groupsByPosition.set(entry.assignment.positionId, group);
    }

    for (const positionGroup of groupsByPosition.values()) {
      const clusters: Array<Array<IndexedAssignment<T>>> = [];
      for (const entry of positionGroup) {
        const current = clusters.at(-1);
        if (
          current &&
          timeToMinutes(current[current.length - 1].assignment.endTime) === timeToMinutes(entry.assignment.startTime)
        ) {
          current.push(entry);
        } else {
          clusters.push([entry]);
        }
      }

      for (const cluster of clusters) {
        if (cluster.length === 1) {
          output.push(cluster[0]);
          continue;
        }
        output.push({
          index: Math.min(...cluster.map(({ index }) => index)),
          assignment: {
            ...cluster[0].assignment,
            startTime: cluster[0].assignment.startTime,
            endTime: cluster[cluster.length - 1].assignment.endTime,
          },
        });
      }
    }
  }

  output.sort((left, right) => left.index - right.index);
  return output.map(({ assignment }) => assignment);
}
