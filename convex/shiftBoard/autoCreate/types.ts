import type { ShiftSubmissionPattern } from "../../_lib/submissionPattern";
import type { DayRequirements } from "../../shiftSetup/dayTemplates";
import type { AutoCreateHistory } from "./history";

// シフトの自動作成（決まった手順）の入力と出力。
// サーバーとフロントで共有する。DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/** そのポジションが担当外か、担当できる場合の熟練度。ここにないポジションは一人前。 */
export type AutoCreateSkillLevel = "unavailable" | "newcomer" | "lead";

export type AutoCreateStaff = {
  id: string;
  positionSkills: ReadonlyArray<{ positionId: string; level: AutoCreateSkillLevel }>;
};

export type AutoCreateInput = {
  pattern: ShiftSubmissionPattern;
  /** 募集の開始日。同じ条件の人から選ぶ値を、募集ごとに変えるために使う。 */
  periodStart: string;
  /** 作る対象になりうる日。募集期間のうち、定休日でない日。 */
  dates: readonly string[];
  /** 希望を提出済みで、シフト対象の、削除されていないスタッフ。ここにいない人には入れない。 */
  staffs: readonly AutoCreateStaff[];
  /** いま有効なポジション。店舗が決めた並び順。 */
  positionIds: readonly string[];
  /** 時間指定とパターン選択の希望。 */
  requestedSlots: ReadonlyArray<{
    staffId: string;
    date: string;
    startTime: string;
    endTime: string;
    optionId?: string;
  }>;
  /** 日付選択の希望。 */
  requestedDates: ReadonlyArray<{ staffId: string; date: string }>;
  /** 日ごとの必要人数。nullの日と、ここにない日は、必要人数がない日として作らない。 */
  days: ReadonlyArray<{ date: string; requirements: DayRequirements | null }>;
  /** 過去の確定シフトの集計。過去がない場合はnull。 */
  history: AutoCreateHistory | null;
  /**
   * 時間指定の勤務へ、休憩を入れるか。
   * 入れない場合は、休憩に合わせて勤務を縮めることも、休憩で足りなくなった時間を埋め直すこともしない。
   * 日付選択とパターン選択は休憩を扱わないため、この値を使わない。
   */
  includesBreaks: boolean;
};

/** 1人の1日分の勤務。区間は開始の早い順に並ぶ。 */
export type AutoCreatedShift = {
  staffId: string;
  date: string;
  segments: Array<{ startTime: string; endTime: string; positionId: string; optionId?: string }>;
  breaks: Array<{ startTime: string; endTime: string }>;
};

export type AutoCreateResult = {
  /** 作った勤務。日付、スタッフの順に並ぶ。 */
  shifts: AutoCreatedShift[];
  /** 必要人数に届かなかった所が残っているか。 */
  hasShortage: boolean;
  /** 必要人数がないため、作らなかった日。 */
  skippedDates: string[];
};
