import type { Id } from "@/convex/_generated/dataModel";
import { LEGACY_POSITION_COLOR_PALETTE, POSITION_ACTIVE_LIMIT, POSITION_COLOR_PALETTE } from "@/convex/constants";
import type { ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";
import { savePositionsSchema } from "@/convex/shiftSetup/schemas";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import { isUnnamedDefaultPosition } from "@/src/domains/shift/operations";
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
  "#60a5fa": "青",
  "#fb923c": "オレンジ",
  "#a78bfa": "紫",
  "#f472b6": "ピンク",
  "#eda40a": "黄",
  "#14b8a6": "青緑",
  "#f87171": "赤",
  "#94a3b8": "グレー",
  "#78bd14": "黄緑",
  "#06b6d4": "水色",
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

/**
 * 名前を付けていない最初のポジション（「シフト」）は、名前の欄を空にして出す。
 * 「シフト」は仮の名前で、利用者に店の持ち場の名前を入れてもらうためである。
 */
export function toPositionDrafts(positions: readonly ShiftSetupPosition[]): PositionDraft[] {
  return positions.map((position) => ({
    rowKey: position._id,
    id: position._id,
    name: isUnnamedDefaultPosition(position) ? "" : position.name,
    color: position.color,
    isDefault: position.isDefault,
  }));
}

/** 1件だけ残った最初のポジションで、名前を入れていない行か。ポジションを分けないまま決定できる。 */
function isLoneUnnamedDefault(drafts: readonly PositionDraft[]): boolean {
  return drafts.length === 1 && drafts[0].isDefault && drafts[0].name.trim() === "";
}

export function canAddPosition(drafts: readonly PositionDraft[]): boolean {
  return drafts.length < POSITION_ACTIVE_LIMIT;
}

// 以前の色と、同じ並びにある今の色。
const CURRENT_COLOR_BY_LEGACY_COLOR = new Map<string, string>(
  LEGACY_POSITION_COLOR_PALETTE.map((color, index) => [color, POSITION_COLOR_PALETTE[index]]),
);

/**
 * 新しく足すポジションの色。まだ使っていない色を先に選ぶ。
 * 以前の色は、同じ並びの今の色を使っているものとして数える。以前の青の隣へ、よく似た今の青を足さないためである。
 */
export function pickUnusedPositionColor(drafts: readonly PositionDraft[]): string {
  const used = new Set(drafts.map((draft) => CURRENT_COLOR_BY_LEGACY_COLOR.get(draft.color) ?? draft.color));
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
 * すべての行を削除して決定したときの一覧。ポジションを追加していない状態へ戻す。
 * 勤務はどれかのポジションに入っている必要があるため、既定のポジションを仮の名前へ戻して1件だけ残す。
 */
export function toUnsplitPositionInputs(positions: readonly ShiftSetupPosition[]): PositionInput[] {
  const kept = positions.find((position) => position.isDefault) ?? positions[0];
  return kept ? [{ id: kept._id, name: DEFAULT_POSITION.name, color: kept.color }] : [];
}

/** つかんだ行を、重ねた行の位置へ動かす。どちらかが一覧になければ、そのまま返す。 */
export function reorderPositionDrafts(
  drafts: readonly PositionDraft[],
  activeRowKey: string,
  overRowKey: string,
): PositionDraft[] {
  const from = drafts.findIndex((draft) => draft.rowKey === activeRowKey);
  const to = drafts.findIndex((draft) => draft.rowKey === overRowKey);
  if (from < 0 || to < 0 || from === to) return [...drafts];
  const next = [...drafts];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Dialogの行を、入力の形へ直す。入力の検証と、Dialogで決めた一覧をページへ渡すために使う。
 * 前に足してまだ保存していないポジションは仮のIDを持つため、保存の引数は`toPositionSaveInputs`で作る。
 */
export function toPositionInputs(drafts: readonly PositionDraft[]): PositionInput[] {
  // 名前を入れずに1件のまま決定した場合は、分けていない状態（仮の名前）のままにする。
  const keepsUnsplit = isLoneUnnamedDefault(drafts);
  return drafts.map((draft) => ({
    ...(draft.id ? { id: draft.id } : {}),
    name: keepsUnsplit ? DEFAULT_POSITION.name : draft.name.trim(),
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
  // すべて削除した一覧は、ポジションを追加していない状態へ戻す操作として受け付ける。
  if (drafts.length === 0) return null;
  const parsed = savePositionsSchema.safeParse({ positions: toPositionInputs(drafts) });
  if (parsed.success) return findDefaultNameErrors(drafts);

  const errors: PositionDraftErrors = { rows: {} };
  for (const issue of parsed.error.issues) {
    const [root, index] = issue.path;
    const draft = root === "positions" && typeof index === "number" ? drafts[index] : undefined;
    if (draft) errors.rows[draft.rowKey] ??= issue.message;
    else errors.form ??= issue.message;
  }
  return errors;
}

/** 仮の名前のまま2件以上にすると、スタッフへの通知とシフト表に「シフト」というポジションが出る。画面で止める。 */
const DEFAULT_NAME_ERROR = `「${DEFAULT_POSITION.name}」以外の名前を入力してください`;

function findDefaultNameErrors(drafts: readonly PositionDraft[]): PositionDraftErrors | null {
  if (drafts.length < 2) return null;
  const rows = Object.fromEntries(
    drafts
      .filter((draft) => draft.name.trim() === DEFAULT_POSITION.name)
      .map((draft) => [draft.rowKey, DEFAULT_NAME_ERROR]),
  );
  return Object.keys(rows).length > 0 ? { rows } : null;
}

/** 保存済みのポジションのうち、名前を変えたものがあるか。仮の名前へ初めて名前を付ける場合は数えない。 */
export function hasRenamedPosition(
  positions: readonly ShiftSetupPosition[],
  drafts: readonly PositionDraft[],
): boolean {
  const draftById = new Map(drafts.flatMap((draft) => (draft.id ? [[draft.id, draft] as const] : [])));
  return positions.some((position) => {
    if (isUnnamedDefaultPosition(position)) return false;
    const name = draftById.get(position._id)?.name.trim();
    return name !== undefined && name !== "" && name !== position.name;
  });
}
