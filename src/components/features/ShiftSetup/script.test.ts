import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { POSITION_COLOR_PALETTE } from "@/convex/constants";
import {
  addPositionDraft,
  canMovePositionDraft,
  canRemovePositionDraft,
  findPositionDraftErrors,
  formatPendingSections,
  getFallbackPositionName,
  getRemovedPositionNames,
  movePositionDraft,
  type PositionDraft,
  pickUnusedPositionColor,
  toPositionDrafts,
  toPositionInputs,
} from "./script";
import type { ShiftSetupPosition } from "./types";

const hall = "position-hall" as Id<"positions">;
const kitchen = "position-kitchen" as Id<"positions">;
const register = "position-register" as Id<"positions">;

const positions: ShiftSetupPosition[] = [
  { _id: hall, name: "ホール", color: "#3b82f6", isDefault: true },
  { _id: kitchen, name: "キッチン", color: "#c2410c", isDefault: false },
  { _id: register, name: "レジ", color: "#7c3aed", isDefault: false },
];

describe("ポジションの編集", () => {
  const drafts = toPositionDrafts(positions);
  const names = (items: readonly PositionDraft[]) => items.map((item) => item.name);

  it("新しく足す行には、まだ使っていない色が入る", () => {
    expect(pickUnusedPositionColor(drafts)).toBe("#db2777");

    const added = addPositionDraft(drafts, "new-1");
    expect(added.at(-1)).toEqual({ rowKey: "new-1", name: "", color: "#db2777", isDefault: false });
  });

  it("9色を使っていれば残りの1色を選び、すべての色を使っていれば一覧の先頭へ戻る", () => {
    const toDrafts = (colors: readonly string[]) =>
      colors.map((color, index) => ({
        rowKey: `row-${index}`,
        name: `ポジション${index}`,
        color,
        isDefault: index === 0,
      }));

    expect(pickUnusedPositionColor(toDrafts(POSITION_COLOR_PALETTE.filter((_, index) => index !== 4)))).toBe(
      POSITION_COLOR_PALETTE[4],
    );
    expect(pickUnusedPositionColor(toDrafts(POSITION_COLOR_PALETTE))).toBe(POSITION_COLOR_PALETTE[0]);
  });

  it("10件に達したら追加しない", () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({
      rowKey: `row-${index}`,
      name: `ポジション${index}`,
      color: POSITION_COLOR_PALETTE[index],
      isDefault: index === 0,
    }));
    const nine = ten.slice(0, 9);

    expect(addPositionDraft(nine, "new-1")).toHaveLength(10);
    expect(addPositionDraft(ten, "new-1")).toEqual(ten);
  });

  it("どのポジションも並び替えられ、端より先へは動かせない", () => {
    expect(canMovePositionDraft(drafts, 0, -1)).toBe(false);
    expect(canMovePositionDraft(drafts, 2, 1)).toBe(false);

    expect(names(movePositionDraft(drafts, 0, 1))).toEqual(["キッチン", "ホール", "レジ"]);
    expect(names(movePositionDraft(drafts, 2, -1))).toEqual(["ホール", "レジ", "キッチン"]);
    expect(names(movePositionDraft(drafts, 2, 1))).toEqual(["ホール", "キッチン", "レジ"]);
  });

  it("最後の1件は削除できず、2件以上あれば最初からあるポジションも削除できる", () => {
    expect(canRemovePositionDraft(drafts)).toBe(true);
    expect(canRemovePositionDraft(drafts.slice(0, 1))).toBe(false);
  });

  it("削除したポジションの勤務の表示先は、既定が残ればそのポジション、削除すれば先頭のポジションになる", () => {
    expect(getFallbackPositionName([drafts[1], drafts[0]])).toBe("ホール");
    expect(getFallbackPositionName(drafts.slice(1))).toBe("キッチン");
    expect(getFallbackPositionName([])).toBeUndefined();
  });

  it("保存する形では、保存済みの行だけがidを持ち、名前の前後の空白を除く", () => {
    const inputs = toPositionInputs([
      ...drafts.slice(0, 1),
      { rowKey: "new-1", name: " デリバリー ", color: "#db2777", isDefault: false },
    ]);

    expect(inputs).toEqual([
      { id: hall, name: "ホール", color: "#3b82f6" },
      { name: "デリバリー", color: "#db2777" },
    ]);
  });

  it("誤りを、空の名前の行と、重複した名前の行へ振り分ける", () => {
    expect(findPositionDraftErrors(drafts)).toBeNull();

    const errors = findPositionDraftErrors([
      ...drafts,
      { rowKey: "empty", name: "  ", color: "#db2777", isDefault: false },
      { rowKey: "duplicated", name: "キッチン", color: "#b45309", isDefault: false },
    ]);

    expect(errors).toEqual({
      rows: { empty: "ポジション名を入力してください", duplicated: "ポジション名が重複しています" },
    });
  });

  it("保存すると削除される、保存済みのポジションの名前を返す", () => {
    const kept = [drafts[0], { rowKey: "new-1", name: "デリバリー", color: "#db2777", isDefault: false }];

    expect(getRemovedPositionNames(positions, kept)).toEqual(["キッチン", "レジ"]);
    expect(getRemovedPositionNames(positions, drafts)).toEqual([]);
  });
});

describe("保存していない変更の表示", () => {
  it("変更のあるセクションの名前を「と」でつなぐ", () => {
    expect(formatPendingSections(["dayTemplates"])).toBe("必要人数");
    expect(formatPendingSections(["staffs"])).toBe("スタッフ");
    expect(formatPendingSections(["dayTemplates", "staffs"])).toBe("必要人数とスタッフ");
    expect(formatPendingSections(["positions"])).toBe("ポジション");
    expect(formatPendingSections(["positions", "dayTemplates", "staffs"])).toBe("ポジションと必要人数とスタッフ");
  });
});
