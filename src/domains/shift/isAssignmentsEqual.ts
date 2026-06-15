// シフト割り当ての内容比較（自動下書き保存のdirty判定に使用）

export type ComparableAssignment = {
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  positionId?: string;
  optionId?: string;
};

const toKey = (assignment: ComparableAssignment): string =>
  [
    assignment.staffId,
    assignment.date,
    assignment.startTime,
    assignment.endTime,
    assignment.positionId ?? "",
    assignment.optionId ?? "",
  ].join("|");

/** 並び順を無視して、2つのシフト割り当てリストが同じ内容かを判定する */
export const isAssignmentsEqual = (a: ComparableAssignment[], b: ComparableAssignment[]): boolean => {
  if (a.length !== b.length) return false;
  const aKeys = a.map(toKey).sort();
  const bKeys = b.map(toKey).sort();
  return aKeys.every((key, index) => key === bKeys[index]);
};
