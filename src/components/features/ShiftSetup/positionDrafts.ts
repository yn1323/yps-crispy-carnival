import type { Id } from "@/convex/_generated/dataModel";
import { remapDayTemplateDraftPositions } from "./dayTemplateDrafts";
import { isSameStaffPositionLevels, toStaffPositionLevels } from "./staffPositionLevels";
import type {
  DayTemplateDraft,
  PositionInput,
  ShiftSetupPosition,
  ShiftSetupStaff,
  StaffPositionLevels,
} from "./types";

// ページで編集中のポジションの一覧を扱うための純粋処理。
// Dialogで決めた一覧は、ページの「保存する」を押すまで保存しない。
// 新しく足したポジションは保存するまでIDがないため、仮のIDを持たせ、保存で受け取ったIDへ置き換える。

type PositionRef = Pick<ShiftSetupPosition, "_id">;
type StaffDrafts = Readonly<Record<string, StaffPositionLevels>>;

const DRAFT_POSITION_ID_PREFIX = "draft-position-";

/** 新しく足したポジションの仮のID。サーバーへは送らない。 */
export function createDraftPositionId(sequence: number): Id<"positions"> {
  return `${DRAFT_POSITION_ID_PREFIX}${sequence}` as Id<"positions">;
}

export function isDraftPositionId(positionId: string): boolean {
  return positionId.startsWith(DRAFT_POSITION_ID_PREFIX);
}

/**
 * Dialogで決めた一覧を、ページで編集中のポジションへ直す。
 * IDのない行は新しいポジションで、仮のIDを振る。既定かどうかは、いまの一覧から引き継ぐ。
 */
export function applyPositionInputs(
  inputs: readonly PositionInput[],
  current: readonly ShiftSetupPosition[],
  createDraftId: () => Id<"positions">,
): ShiftSetupPosition[] {
  const defaultIds = new Set(current.filter((position) => position.isDefault).map((position) => position._id));
  return inputs.map((input) => {
    const id = input.id ?? createDraftId();
    return { _id: id, name: input.name, color: input.color, isDefault: defaultIds.has(id) };
  });
}

/** 保存内容として同じ一覧かを返す。件数、並び順、名前、色を比べる。 */
export function isSamePositions(left: readonly ShiftSetupPosition[], right: readonly ShiftSetupPosition[]): boolean {
  return (
    left.length === right.length &&
    left.every((position, index) => {
      const other = right[index];
      return position._id === other._id && position.name === other.name && position.color === other.color;
    })
  );
}

/** 保存する形へ直す。仮のIDは送らず、IDのないポジションとして新しく作らせる。 */
export function toPositionSaveInputs(positions: readonly ShiftSetupPosition[]): PositionInput[] {
  return positions.map((position) => ({
    ...(isDraftPositionId(position._id) ? {} : { id: position._id }),
    name: position.name,
    color: position.color,
  }));
}

/** 編集中のポジションのIDから、保存後のIDへの対応。 */
export type SavedPositionIds = ReadonlyMap<string, Id<"positions">>;

/**
 * 保存の応答（入力と同じ順のID）から、編集中のIDと保存後のIDの対応を作る。
 * 応答の件数が合わないときは、どのポジションのIDかを決められないためエラーにする。
 */
export function resolveSavedPositionIds(
  positions: readonly PositionRef[],
  savedIds: readonly Id<"positions">[],
): SavedPositionIds {
  if (!Array.isArray(savedIds) || savedIds.length !== positions.length) {
    throw new Error("保存したポジションを確認できませんでした。ページを再読み込みして、もう一度お試しください。");
  }
  return new Map(positions.map((position, index) => [position._id, savedIds[index]]));
}

/** ポジションの一覧のIDを、保存後のIDへ置き換える。 */
export function replacePositionIds<Position extends PositionRef>(
  positions: readonly Position[],
  savedIds: SavedPositionIds,
): Position[] {
  return positions.map((position) => ({ ...position, _id: savedIds.get(position._id) ?? position._id }));
}

/** 一覧にないポジションのバーと人数を、型の下書きから外す。 */
export function keepPositionsInDayTemplateDrafts(
  drafts: readonly DayTemplateDraft[],
  positions: readonly PositionRef[],
): DayTemplateDraft[] {
  const keptIds = new Set<string>(positions.map((position) => position._id));
  return remapDayTemplateDraftPositions(drafts, (positionId) => (keptIds.has(positionId) ? positionId : null));
}

/** 型の下書きが指すポジションのIDを、保存後のIDへ置き換える。 */
export function replacePositionIdsInDayTemplateDrafts(
  drafts: readonly DayTemplateDraft[],
  savedIds: SavedPositionIds,
): DayTemplateDraft[] {
  return remapDayTemplateDraftPositions(drafts, (positionId) => savedIds.get(positionId) ?? positionId);
}

/**
 * ポジションの一覧を変えたあとの、スタッフの編集中の値を返す。保存済みの値と同じになったスタッフは含めない。
 * 一覧にないポジションの値は外す。
 * 残ったポジションのすべてが「入れない」になったスタッフは、「入れない」を外して全ポジションに入れるものとする。
 * 保存したあとにサーバーが返す値と、保存の前の表示をそろえるためである。
 */
export function reconcileStaffDrafts(
  staffs: readonly ShiftSetupStaff[],
  drafts: StaffDrafts,
  positions: readonly PositionRef[],
): Record<string, StaffPositionLevels> {
  const next: Record<string, StaffPositionLevels> = {};
  for (const staff of staffs) {
    const saved = toStaffPositionLevels(staff, positions);
    const draft = drafts[staff._id];
    const kept = draft
      ? Object.fromEntries(positions.flatMap(({ _id }) => (draft[_id] ? [[_id, draft[_id]]] : [])))
      : saved;
    const hasAvailablePosition = positions.some((position) => kept[position._id] !== "unavailable");
    const levels = hasAvailablePosition
      ? kept
      : Object.fromEntries(Object.entries(kept).filter(([, level]) => level !== "unavailable"));
    if (!isSameStaffPositionLevels(levels, saved, positions)) next[staff._id] = levels;
  }
  return next;
}

/** スタッフの編集中の値が指すポジションのIDを、保存後のIDへ置き換える。 */
export function replacePositionIdsInStaffDrafts(
  drafts: StaffDrafts,
  savedIds: SavedPositionIds,
): Record<string, StaffPositionLevels> {
  return Object.fromEntries(
    Object.entries(drafts).map(([staffId, levels]) => [
      staffId,
      Object.fromEntries(
        Object.entries(levels).map(([positionId, level]) => [savedIds.get(positionId) ?? positionId, level]),
      ),
    ]),
  );
}
