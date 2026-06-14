import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { BREAK_POSITION } from "./constants";
import { formatShiftClockTime, timeToMinutes } from "./time";
import type { ShiftData } from "./types";

// 確定をブロックしない「確認事項」（ワーニング）。希望と割当の食い違いを助言として知らせる。
// エラー（convex/shiftBoard/validation.ts）と違いサーバー強制は不要なので、クライアントのみの純粋関数。
// 戻り値の形はAssignmentIssueと揃え、エラーと同じ表示/ジャンプ/ハイライトの仕組みを再利用する。

export type AssignmentWarningCode =
  | "NOT_SUBMITTED" // 未提出スタッフが勤務に入っている
  | "OFF_REQUEST" // 休み希望の日に勤務が入っている
  | "OUTSIDE_REQUESTED_TIME" // 希望時間の枠外にはみ出した勤務（時間募集）
  | "UNREQUESTED_SHIFT_TYPE"; // 希望していない勤務区分の割当（勤務区分募集）

export type AssignmentWarning = {
  code: AssignmentWarningCode;
  date: string;
  staffId: string;
  message: string;
};

const isBreakSegment = (positionId: string) => positionId === BREAK_POSITION.id;

export type AssignmentWarningInput = {
  shifts: ShiftData[];
  staffs: Array<{ id: string; isSubmitted: boolean }>;
  pattern?: ShiftSubmissionPattern;
};

// 各セル（スタッフ×日付）の「割当」と「希望」を比べ、食い違いを1セルあたり最大1件で収集する。
// NOT_SUBMITTED / OFF_REQUEST / 枠外・区分外 は提出状況と希望有無で自然に排他になる。
export function computeAssignmentWarnings(input: AssignmentWarningInput): AssignmentWarning[] {
  const isSubmittedById = new Map(input.staffs.map((staff) => [staff.id, staff.isSubmitted]));
  const kind = input.pattern?.kind ?? "time";
  const optionNameById = new Map(
    input.pattern?.kind === "shiftType" ? input.pattern.options.map((option) => [option.id, option.name]) : [],
  );

  const warnings: AssignmentWarning[] = [];

  for (const shift of input.shifts) {
    // positionsは「確定時に保存される勤務」を表す（休憩以外）。
    // 保存済み割当がないセルでは希望がプレビューとしてpositionsに入るが、これも確定すれば
    // そのまま割当になるため評価対象に含めてよい（希望＝プレビューなので食い違いは生じない）。
    const work = shift.positions.filter((position) => !isBreakSegment(position.positionId));
    if (work.length === 0) continue;

    const add = (code: AssignmentWarningCode, message: string) =>
      warnings.push({ code, date: shift.date, staffId: shift.staffId, message });

    // 未提出は希望データが存在しないため、休み希望・希望時間外とは別カテゴリ
    if (!isSubmittedById.get(shift.staffId)) {
      add("NOT_SUBMITTED", "未提出のまま勤務に入っています");
      continue;
    }

    if (kind === "shiftType") {
      const requestedOptionIds = new Set(shift.requestedShiftTypeOptionIds ?? []);
      if (requestedOptionIds.size === 0) {
        add("OFF_REQUEST", "休み希望の日に勤務が入っています");
        continue;
      }
      const unrequestedNames = [
        ...new Set(
          work
            .filter((position) => position.shiftTypeOptionId && !requestedOptionIds.has(position.shiftTypeOptionId))
            .map((position) => optionNameById.get(position.shiftTypeOptionId ?? "") ?? "勤務区分"),
        ),
      ];
      if (unrequestedNames.length > 0) {
        add("UNREQUESTED_SHIFT_TYPE", `希望していない勤務区分（${unrequestedNames.join("・")}）が入っています`);
      }
      continue;
    }

    const requestedTimes = shift.requestedTimes ?? (shift.requestedTime ? [shift.requestedTime] : []);
    if (requestedTimes.length === 0) {
      add("OFF_REQUEST", "休み希望の日に勤務が入っています");
      continue;
    }

    // 日付のみ募集は時間粒度がないため、枠外判定は行わない
    if (kind === "dateOnly") continue;

    // 希望可能枠（最早の開始〜最遅の終了）を割当がはみ出していれば警告。枠内で短くするのは正常
    const earliestStart = requestedTimes.reduce(
      (earliest, range) => (timeToMinutes(range.start) < timeToMinutes(earliest) ? range.start : earliest),
      requestedTimes[0].start,
    );
    const latestEnd = requestedTimes.reduce(
      (latest, range) => (timeToMinutes(range.end) > timeToMinutes(latest) ? range.end : latest),
      requestedTimes[0].end,
    );
    const isOutside = work.some(
      (position) =>
        timeToMinutes(position.start) < timeToMinutes(earliestStart) ||
        timeToMinutes(position.end) > timeToMinutes(latestEnd),
    );
    if (isOutside) {
      add(
        "OUTSIDE_REQUESTED_TIME",
        `希望時間（${formatShiftClockTime(earliestStart)}-${formatShiftClockTime(latestEnd)}）の外に勤務があります`,
      );
    }
  }

  return warnings;
}
