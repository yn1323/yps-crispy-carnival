import type { PositionType, ShiftData, ShiftTimeRange } from "./types";

// 自動作成の結果を、画面の勤務へ取り込む純粋処理。
// 勤務を作る手順そのものは`convex/shiftBoard/autoCreate/`にあり、ここは結果を下書きの形へ直すだけである。

/** 自動作成が作った、1人の1日分の勤務。 */
export type AutoCreatedShift = {
  staffId: string;
  date: string;
  segments: ReadonlyArray<{ startTime: string; endTime: string; positionId: string; optionId?: string }>;
  breaks: ReadonlyArray<{ startTime: string; endTime: string }>;
};

type ApplyInput = {
  shifts: readonly ShiftData[];
  created: readonly AutoCreatedShift[];
  positions: readonly PositionType[];
};

/**
 * 下書きの勤務を、自動作成の結果ですべて置き換える。
 * 結果にない日は、手で入れた勤務も消す。希望は変えない。
 */
export const applyAutoAssignments = (input: ApplyInput): ShiftData[] => {
  const positionById = new Map(input.positions.map((position) => [position.id, position]));
  const createdByCell = new Map(input.created.map((item) => [`${item.staffId}|${item.date}`, item]));

  return input.shifts.map((shift) => {
    const { breaks: _breaks, ...rest } = shift;
    const created = createdByCell.get(`${shift.staffId}|${shift.date}`);
    const segments = (created?.segments ?? []).flatMap((segment, index) => {
      const position = positionById.get(segment.positionId);
      if (!position) return [];
      // 区間のIDは、手で入れたときと同じ形にそろえる。パターン選択は勤務パターンごと、時間指定は並びの順である。
      const suffix = segment.optionId ?? (created && created.segments.length > 1 ? String(index) : "");
      return [
        {
          id: suffix ? `seg-${shift.staffId}-${shift.date}-${suffix}` : `seg-${shift.staffId}-${shift.date}`,
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: segment.startTime,
          end: segment.endTime,
          ...(segment.optionId ? { shiftTypeOptionId: segment.optionId } : {}),
        },
      ];
    });
    const breaks: ShiftTimeRange[] =
      segments.length > 0 ? (created?.breaks ?? []).map((item) => ({ start: item.startTime, end: item.endTime })) : [];

    return { ...rest, positions: segments, ...(breaks.length > 0 ? { breaks } : {}) };
  });
};
