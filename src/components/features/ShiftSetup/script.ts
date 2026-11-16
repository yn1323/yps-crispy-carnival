import type { Id } from "@/convex/_generated/dataModel";
import { POSITION_ACTIVE_LIMIT, POSITION_COLOR_PALETTE } from "@/convex/constants";
import type { ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";
import { savePositionsSchema } from "@/convex/shiftSetup/schemas";
import type { PendingSection, PositionInput, ShiftSetupData, ShiftSetupPosition } from "./types";

// ポジションを編集するための純粋処理と、ページ全体で使う表示の変換。

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

const PENDING_SECTION_LABELS: Record<PendingSection, string> = {
  positions: "ポジション",
  dayTemplates: "必要人数",
  staffs: "スタッフ",
};

/** 保存していない変更を持つセクションの名前を「ポジションと必要人数とスタッフ」の形でつなぐ。 */
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

/** 並び替えられるかを返す。 */
export function canMovePositionDraft(drafts: readonly PositionDraft[], index: number, direction: -1 | 1): boolean {
  return Boolean(drafts[index] && drafts[index + direction]);
}

/** ポジションは1件以上必要なため、最後の1件は削除できない。 */
export function canRemovePositionDraft(drafts: readonly PositionDraft[]): boolean {
  return drafts.length > 1;
}

/**
 * 削除したポジションの勤務の表示先になるポジションの名前を返す。
 * 既定のポジションが残っていればそのポジション、削除していれば保存後に既定になる先頭のポジション。
 */
export function getFallbackPositionName(drafts: readonly PositionDraft[]): string | undefined {
  const fallback = drafts.find((draft) => draft.isDefault) ?? drafts[0];
  return fallback?.name.trim() || undefined;
}

export function movePositionDraft(drafts: readonly PositionDraft[], index: number, direction: -1 | 1): PositionDraft[] {
  if (!canMovePositionDraft(drafts, index, direction)) return [...drafts];
  const next = [...drafts];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}

/**
 * Dialogの行を、入力の形へ直す。入力の検証と、Dialogで決めた一覧をページへ渡すために使う。
 * 前に足してまだ保存していないポジションは仮のIDを持つため、保存の引数は`toPositionSaveInputs`で作る。
 */
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
