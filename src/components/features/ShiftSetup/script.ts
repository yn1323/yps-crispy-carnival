import type { Id } from "@/convex/_generated/dataModel";
import { POSITION_ACTIVE_LIMIT, POSITION_COLOR_PALETTE } from "@/convex/constants";
import type { ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";
import {
  BREAK_RULE_BREAK_UNIT_MINUTES,
  BREAK_RULE_WORK_UNIT_MINUTES,
  breakRuleSchema,
  savePositionsSchema,
} from "@/convex/shiftSetup/schemas";
import type {
  PendingSection,
  PositionInput,
  ShiftSetupBreakRule,
  ShiftSetupData,
  ShiftSetupPosition,
  ShiftSetupStaff,
  StaffProfile,
  StaffShiftProfileInput,
  StaffSkillLevel,
} from "./types";

// ポジション、スタッフの条件、休憩の決まりを編集するための純粋処理。

/** 画面に並べる曜日。店舗詳細の定休日と同じく月曜から始める。 */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: ShiftSetupWeekday; label: string }> = [
  { value: "mon", label: "月" },
  { value: "tue", label: "火" },
  { value: "wed", label: "水" },
  { value: "thu", label: "木" },
  { value: "fri", label: "金" },
  { value: "sat", label: "土" },
  { value: "sun", label: "日" },
];

export const SKILL_LEVEL_OPTIONS: ReadonlyArray<{ value: StaffSkillLevel; label: string }> = [
  { value: "newcomer", label: "新人" },
  { value: "standard", label: "標準" },
  { value: "lead", label: "責任者" },
];

const PENDING_SECTION_LABELS: Record<PendingSection, string> = {
  dayTemplates: "必要人数",
  staffs: "スタッフ",
};

/** 保存していない変更を持つセクションの名前を「必要人数とスタッフ」の形でつなぐ。 */
export function formatPendingSections(sections: readonly PendingSection[]): string {
  return sections.map((section) => PENDING_SECTION_LABELS[section]).join("と");
}

export function getShiftSetupReadOnlyReason(reason: ShiftSetupData["businessWriteBlockReason"]): string {
  switch (reason) {
    case "paymentResultPending":
      return "支払い結果を確認中のため、設定を変更できません。";
    case "usageLimitExceeded":
      return "現在のプラン上限を超えているため、設定を変更できません。\n組織設定で利用人数・店舗・管理者を整理するか、プランを変更してください。";
    case "usageLimitEvaluationUnavailable":
      return "利用状況を確認できないため、設定を変更できません。\n管理画面で利用状況を確認してください。";
    default:
      return "現在、この店舗の設定を変更できません。";
  }
}

// ---- ポジション ----

/** 色の読み上げ名。色の見分けに頼らず選べるよう、選択肢のラベルに使う。 */
const POSITION_COLOR_LABELS: Record<string, string> = {
  "#3b82f6": "青",
  "#c2410c": "オレンジ",
  "#7c3aed": "紫",
  "#db2777": "ピンク",
  "#b45309": "黄",
  "#0f766e": "青緑",
  "#dc2626": "赤",
  "#475569": "グレー",
  "#4d7c0f": "黄緑",
  "#0e7490": "水色",
};

export const POSITION_COLOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = POSITION_COLOR_PALETTE.map(
  (color, index) => ({ value: color, label: POSITION_COLOR_LABELS[color] ?? `色${index + 1}` }),
);

export type PositionDraft = {
  rowKey: string;
  id?: Id<"positions">;
  name: string;
  color: string;
  isDefault: boolean;
};

export function toPositionDrafts(positions: readonly ShiftSetupPosition[]): PositionDraft[] {
  return positions.map((position) => ({
    rowKey: position._id,
    id: position._id,
    name: position.name,
    color: position.color,
    isDefault: position.isDefault,
  }));
}

export function canAddPosition(drafts: readonly PositionDraft[]): boolean {
  return drafts.length < POSITION_ACTIVE_LIMIT;
}

/** 新しく足すポジションの色。まだ使っていない色を先に選ぶ。 */
export function pickUnusedPositionColor(drafts: readonly PositionDraft[]): string {
  const used = new Set(drafts.map((draft) => draft.color));
  return (
    POSITION_COLOR_PALETTE.find((color) => !used.has(color)) ??
    POSITION_COLOR_PALETTE[drafts.length % POSITION_COLOR_PALETTE.length]
  );
}

export function addPositionDraft(drafts: readonly PositionDraft[], rowKey: string): PositionDraft[] {
  if (!canAddPosition(drafts)) return [...drafts];
  return [...drafts, { rowKey, name: "", color: pickUnusedPositionColor(drafts), isDefault: false }];
}

/**
 * 並び替えられるかを返す。
 * 最初からあるポジションは、設定ページでは先頭に固定し、並び替えの対象にしない。
 */
export function canMovePositionDraft(drafts: readonly PositionDraft[], index: number, direction: -1 | 1): boolean {
  const source = drafts[index];
  const destination = drafts[index + direction];
  return Boolean(source && destination && !source.isDefault && !destination.isDefault);
}

export function movePositionDraft(drafts: readonly PositionDraft[], index: number, direction: -1 | 1): PositionDraft[] {
  if (!canMovePositionDraft(drafts, index, direction)) return [...drafts];
  const next = [...drafts];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}

export function toPositionInputs(drafts: readonly PositionDraft[]): PositionInput[] {
  return drafts.map((draft) => ({
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name.trim(),
    color: draft.color,
  }));
}

export type PositionDraftErrors = {
  /** 行ごとの誤り。キーは行の`rowKey`。 */
  rows: Record<string, string>;
  /** 行に結び付かない誤り。 */
  form?: string;
};

/** 共有schemaで検証し、誤りを行ごとに振り分ける。誤りがなければnullを返す。 */
export function findPositionDraftErrors(drafts: readonly PositionDraft[]): PositionDraftErrors | null {
  const parsed = savePositionsSchema.safeParse({ positions: toPositionInputs(drafts) });
  if (parsed.success) return null;

  const errors: PositionDraftErrors = { rows: {} };
  for (const issue of parsed.error.issues) {
    const [root, index] = issue.path;
    const draft = root === "positions" && typeof index === "number" ? drafts[index] : undefined;
    if (draft) errors.rows[draft.rowKey] ??= issue.message;
    else errors.form ??= issue.message;
  }
  return errors;
}

/** 保存すると削除される、保存済みのポジションの名前を返す。 */
export function getRemovedPositionNames(
  positions: readonly ShiftSetupPosition[],
  drafts: readonly PositionDraft[],
): string[] {
  const keptIds = new Set(drafts.flatMap((draft) => (draft.id ? [draft.id] : [])));
  return positions.filter((position) => !keptIds.has(position._id)).map((position) => position.name);
}

// ---- スタッフ ----

type PositionRef = Pick<ShiftSetupPosition, "_id">;

/** 入れないポジションを、いまあるポジションの並び順にそろえる。比較と保存の両方で使う。 */
function normalizeUnavailablePositionIds(
  unavailablePositionIds: readonly Id<"positions">[],
  positions: readonly PositionRef[],
): Id<"positions">[] {
  const unavailable = new Set(unavailablePositionIds);
  return positions.filter((position) => unavailable.has(position._id)).map((position) => position._id);
}

export function resolveStaffProfile(staff: ShiftSetupStaff, draft: StaffProfile | undefined): StaffProfile {
  return draft ?? { unavailablePositionIds: staff.unavailablePositionIds, skillLevel: staff.skillLevel };
}

/** そのポジションが、スタッフに残った最後の「入れるポジション」かを返す。最後の1つは外せない。 */
export function isLastAvailablePosition(
  profile: StaffProfile,
  positionId: Id<"positions">,
  positions: readonly PositionRef[],
): boolean {
  const unavailable = normalizeUnavailablePositionIds(profile.unavailablePositionIds, positions);
  return !unavailable.includes(positionId) && unavailable.length >= positions.length - 1;
}

/** ポジションに入れるかどうかを切り替える。最後の1つを外す操作は無視する。 */
export function toggleStaffPosition(
  profile: StaffProfile,
  positionId: Id<"positions">,
  positions: readonly PositionRef[],
): StaffProfile {
  if (profile.unavailablePositionIds.includes(positionId)) {
    return {
      ...profile,
      unavailablePositionIds: profile.unavailablePositionIds.filter((id) => id !== positionId),
    };
  }
  if (isLastAvailablePosition(profile, positionId, positions)) return profile;
  return { ...profile, unavailablePositionIds: [...profile.unavailablePositionIds, positionId] };
}

export function isSameStaffProfile(
  left: StaffProfile,
  right: StaffProfile,
  positions: readonly PositionRef[],
): boolean {
  return (
    left.skillLevel === right.skillLevel &&
    normalizeUnavailablePositionIds(left.unavailablePositionIds, positions).join() ===
      normalizeUnavailablePositionIds(right.unavailablePositionIds, positions).join()
  );
}

/** 保存する形へ直す。保存済みの値から変えたスタッフだけを返す。 */
export function toStaffProfileInputs(
  staffs: readonly ShiftSetupStaff[],
  drafts: Readonly<Record<string, StaffProfile>>,
  positions: readonly PositionRef[],
): StaffShiftProfileInput[] {
  return staffs.flatMap((staff) => {
    const draft = drafts[staff._id];
    if (!draft || isSameStaffProfile(draft, resolveStaffProfile(staff, undefined), positions)) return [];
    return [
      {
        staffId: staff._id,
        unavailablePositionIds: normalizeUnavailablePositionIds(draft.unavailablePositionIds, positions),
        skillLevel: draft.skillLevel,
      },
    ];
  });
}

// ---- 休憩の決まり ----

const WORK_OPTION_MIN_MINUTES = 60;
const WORK_OPTION_MAX_MINUTES = 12 * 60;
const BREAK_OPTION_MAX_MINUTES = 2 * 60;

/** 分を「6時間」「6時間30分」「45分」の形で返す。 */
export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}分`;
  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`;
}

function buildDurationOptions(min: number, max: number, step: number, current: number | undefined) {
  const values = new Set<number>();
  for (let minutes = min; minutes <= max; minutes += step) values.add(minutes);
  // 選択肢の範囲外で保存済みの値も、選んだ状態で表示できるようにする。
  if (current !== undefined) values.add(current);
  return [...values]
    .sort((left, right) => left - right)
    .map((minutes) => ({ value: String(minutes), label: formatDurationMinutes(minutes) }));
}

/** 勤務の長さの選択肢（30分単位）。 */
export function getBreakRuleWorkOptions(current?: number) {
  return buildDurationOptions(WORK_OPTION_MIN_MINUTES, WORK_OPTION_MAX_MINUTES, BREAK_RULE_WORK_UNIT_MINUTES, current);
}

/** 休憩の長さの選択肢（15分単位）。 */
export function getBreakRuleBreakOptions(current?: number) {
  return buildDurationOptions(
    BREAK_RULE_BREAK_UNIT_MINUTES,
    BREAK_OPTION_MAX_MINUTES,
    BREAK_RULE_BREAK_UNIT_MINUTES,
    current,
  );
}

export function formatBreakRule(rule: ShiftSetupBreakRule | null): string {
  if (!rule) return "決まりなし";
  return `${formatDurationMinutes(rule.minWorkMinutes)}以上の勤務に${formatDurationMinutes(rule.breakMinutes)}`;
}

export type BreakRuleFormErrors = { minWorkMinutes?: string; breakMinutes?: string };

/** 選んだ値を共有schemaで検証する。未選択は0として扱い、選ぶよう促す文言を返す。 */
export function parseBreakRuleForm(form: {
  minWorkMinutes: string;
  breakMinutes: string;
}): { rule: ShiftSetupBreakRule } | { errors: BreakRuleFormErrors } {
  const parsed = breakRuleSchema.safeParse({
    minWorkMinutes: Number(form.minWorkMinutes || 0),
    breakMinutes: Number(form.breakMinutes || 0),
  });
  if (parsed.success) return { rule: parsed.data };

  const errors: BreakRuleFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "minWorkMinutes" || field === "breakMinutes") errors[field] ??= issue.message;
  }
  return { errors };
}
