// シフトの自動作成が参考にする、過去の確定シフトの集計。
// サーバー（シフト表のquery）とフロント（自動作成の手順の入力）で共有する。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/** 過去に確定した1つの募集の、希望と勤務。 */
export type AutoCreateHistoryRecruitment<StaffId extends string = string, PositionId extends string = string> = {
  /** その募集で希望を提出した人。 */
  submittedStaffIds: readonly StaffId[];
  /** 希望のある日。同じ人の同じ日が複数あってもよい。 */
  requestedDays: ReadonlyArray<{ staffId: StaffId; date: string }>;
  /** 確定した勤務。 */
  assignments: ReadonlyArray<{ staffId: StaffId; date: string; positionId: PositionId }>;
};

/** 1人分の集計。日数は、希望を出した日だけを数える。 */
export type AutoCreateStaffHistory<StaffId extends string = string, PositionId extends string = string> = {
  staffId: StaffId;
  /** 希望した日数。 */
  requestedDays: number;
  /** 希望した日のうち、勤務が入った日数。 */
  assignedDays: number;
  /** 直近の1回で希望した日数。その回に提出していなければ0。 */
  lastRequestedDays: number;
  /** 直近の1回で、希望した日のうち勤務が入った日数。 */
  lastAssignedDays: number;
  /** ポジションごとの、勤務が入った日数。入ったことのあるポジションだけを持つ。 */
  positions: Array<{ positionId: PositionId; days: number }>;
};

export type AutoCreateHistory<StaffId extends string = string, PositionId extends string = string> = {
  /** 集計に使った募集の数。 */
  recruitmentCount: number;
  /** 希望を1日以上出したことのある人だけを、渡された並びで持つ。 */
  staffs: AutoCreateStaffHistory<StaffId, PositionId>[];
};

type Tally<PositionId extends string> = {
  requestedDays: number;
  assignedDays: number;
  lastRequestedDays: number;
  lastAssignedDays: number;
  positionDays: Map<PositionId, number>;
};

/**
 * 過去の募集の希望と勤務を、人ごとの日数に数える。
 * 数えるのは、その募集で希望を提出した人の、希望のある日だけである。希望のない日の勤務は数えない。
 * `recruitments`は新しい順に渡す。先頭を「直近の1回」として扱う。
 */
export function summarizeAutoCreateHistory<StaffId extends string, PositionId extends string>(input: {
  recruitments: ReadonlyArray<AutoCreateHistoryRecruitment<StaffId, PositionId>>;
  /** 集計の対象にする人。ここにいない人の数は返さない。 */
  staffIds: readonly StaffId[];
}): AutoCreateHistory<StaffId, PositionId> {
  const targetStaffIds = new Set(input.staffIds);
  const tallies = new Map<StaffId, Tally<PositionId>>();

  input.recruitments.forEach((recruitment, index) => {
    const isLast = index === 0;
    const submitted = new Set(recruitment.submittedStaffIds.filter((staffId) => targetStaffIds.has(staffId)));
    const requestedDatesByStaff = new Map<StaffId, Set<string>>();
    for (const request of recruitment.requestedDays) {
      if (!submitted.has(request.staffId)) continue;
      const dates = requestedDatesByStaff.get(request.staffId) ?? new Set<string>();
      dates.add(request.date);
      requestedDatesByStaff.set(request.staffId, dates);
    }
    // 1人の1日に同じポジションの勤務が複数あっても、1日として数える。
    const positionsByStaffDate = new Map<StaffId, Map<string, Set<PositionId>>>();
    for (const assignment of recruitment.assignments) {
      if (!requestedDatesByStaff.get(assignment.staffId)?.has(assignment.date)) continue;
      const byDate = positionsByStaffDate.get(assignment.staffId) ?? new Map<string, Set<PositionId>>();
      const positions = byDate.get(assignment.date) ?? new Set<PositionId>();
      positions.add(assignment.positionId);
      byDate.set(assignment.date, positions);
      positionsByStaffDate.set(assignment.staffId, byDate);
    }

    for (const [staffId, requestedDates] of requestedDatesByStaff) {
      const tally = tallies.get(staffId) ?? {
        requestedDays: 0,
        assignedDays: 0,
        lastRequestedDays: 0,
        lastAssignedDays: 0,
        positionDays: new Map<PositionId, number>(),
      };
      const assignedByDate = positionsByStaffDate.get(staffId);
      const assignedDays = assignedByDate?.size ?? 0;
      tally.requestedDays += requestedDates.size;
      tally.assignedDays += assignedDays;
      if (isLast) {
        tally.lastRequestedDays = requestedDates.size;
        tally.lastAssignedDays = assignedDays;
      }
      for (const positions of assignedByDate?.values() ?? []) {
        for (const positionId of positions) {
          tally.positionDays.set(positionId, (tally.positionDays.get(positionId) ?? 0) + 1);
        }
      }
      tallies.set(staffId, tally);
    }
  });

  const staffs: AutoCreateStaffHistory<StaffId, PositionId>[] = [];
  for (const staffId of input.staffIds) {
    const tally = tallies.get(staffId);
    if (!tally) continue;
    staffs.push({
      staffId,
      requestedDays: tally.requestedDays,
      assignedDays: tally.assignedDays,
      lastRequestedDays: tally.lastRequestedDays,
      lastAssignedDays: tally.lastAssignedDays,
      positions: [...tally.positionDays.entries()]
        .map(([positionId, days]) => ({ positionId, days }))
        .sort((a, b) => (a.positionId < b.positionId ? -1 : a.positionId > b.positionId ? 1 : 0)),
    });
  }
  return { recruitmentCount: input.recruitments.length, staffs };
}
