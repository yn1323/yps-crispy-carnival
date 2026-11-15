import { isCanonicalWorkPosition } from "./positions";
import type { PositionType, ShiftData, ShiftTimeRange } from "./types";

// 未提出者の「仮の勤務」: 前回確定した勤務の候補を、勤務のない日へ差し込む純粋処理。

export type ProvisionalAssignmentCandidate = {
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  positionId: string;
  optionId?: string;
  breaks?: ReadonlyArray<{ startTime: string; endTime: string }>;
};

type InsertInput = {
  shifts: readonly ShiftData[];
  candidates: readonly ProvisionalAssignmentCandidate[];
  // いま未提出のスタッフ。提出済みのスタッフへは入れない。
  unsubmittedStaffIds: ReadonlySet<string>;
  positions: readonly PositionType[];
};

/**
 * 候補を、未提出者の勤務のない日へ「仮」の印付きで入れる。
 * すでに勤務のある日と、提出済みのスタッフは変えない。変えた日数も返す。
 */
export const insertProvisionalAssignments = (input: InsertInput): { shifts: ShiftData[]; insertedCount: number } => {
  const positionById = new Map(input.positions.map((position) => [position.id, position]));
  const fallbackPosition = input.positions.find((position) => position.isDefault) ?? input.positions[0];
  const candidatesByCell = new Map<string, ProvisionalAssignmentCandidate[]>();
  for (const candidate of input.candidates) {
    if (!input.unsubmittedStaffIds.has(candidate.staffId)) continue;
    const key = `${candidate.staffId}|${candidate.date}`;
    const items = candidatesByCell.get(key) ?? [];
    items.push(candidate);
    candidatesByCell.set(key, items);
  }

  let insertedCount = 0;
  const shifts = input.shifts.map((shift) => {
    const candidates = candidatesByCell.get(`${shift.staffId}|${shift.date}`);
    if (!candidates || !fallbackPosition) return shift;
    if (shift.positions.some(isCanonicalWorkPosition)) return shift;

    const sorted = candidates.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
    const breaks: ShiftTimeRange[] = sorted.flatMap((candidate) =>
      (candidate.breaks ?? []).map((item) => ({ start: item.startTime, end: item.endTime })),
    );
    insertedCount += 1;
    return {
      ...shift,
      positions: sorted.map((candidate, index) => {
        const position = positionById.get(candidate.positionId) ?? fallbackPosition;
        return {
          id: `seg-${shift.staffId}-${shift.date}-provisional-${index}`,
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: candidate.startTime,
          end: candidate.endTime,
          ...(candidate.optionId ? { shiftTypeOptionId: candidate.optionId } : {}),
        };
      }),
      ...(breaks.length > 0 ? { breaks } : {}),
      isProvisional: true,
    };
  });
  return { shifts, insertedCount };
};
