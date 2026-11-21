import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { POSITION_COLOR_PALETTE } from "@/convex/constants";
import {
  addPositionDraft,
  findPositionDraftErrors,
  formatPendingSections,
  hasRenamedPosition,
  type PositionDraft,
  pickUnusedPositionColor,
  reorderPositionDrafts,
  toPositionDrafts,
  toPositionInputs,
  toUnsplitPositionInputs,
} from "./script";
import type { ShiftSetupPosition } from "./types";

const hall = "position-hall" as Id<"positions">;
const kitchen = "position-kitchen" as Id<"positions">;
const register = "position-register" as Id<"positions">;

const positions: ShiftSetupPosition[] = [
  { _id: hall, name: "ホール", color: "#60a5fa", isDefault: true },
  { _id: kitchen, name: "キッチン", color: "#fb923c", isDefault: false },
  { _id: register, name: "レジ", color: "#a78bfa", isDefault: false },
];

describe("名前を付けていない最初のポジション（シフト）", () => {
  const shift = "position-shift" as Id<"positions">;
  const unnamed: ShiftSetupPosition = { _id: shift, name: "シフト", color: "#60a5fa", isDefault: true };
  const kitchenPosition: ShiftSetupPosition = { _id: kitchen, name: "キッチン", color: "#fb923c", isDefault: false };

  it("編集では名前の欄を空にして出し、利用者が付けた名前はそのまま出す", () => {
    expect(toPositionDrafts([unnamed, kitchenPosition]).map((draft) => draft.name)).toEqual(["", "キッチン"]);
    expect(toPositionDrafts(positions).map((draft) => draft.name)).toEqual(["ホール", "キッチン", "レジ"]);
  });

  it("名前を入れずに1件のまま決定すると、分けていない状態のままになる", () => {
    const drafts = toPositionDrafts([unnamed]);

    expect(findPositionDraftErrors(drafts)).toBeNull();
    expect(toPositionInputs(drafts)).toEqual([{ id: shift, name: "シフト", color: "#60a5fa" }]);
  });

  it("2件以上では、名前が空の行と「シフト」の行を誤りにする", () => {
    const blank = addPositionDraft(toPositionDrafts([unnamed]), "new-1").map((draft) =>
      draft.rowKey === "new-1" ? { ...draft, name: "キッチン" } : draft,
    );
    expect(findPositionDraftErrors(blank)?.rows[shift]).toBe("ポジション名を入力してください");

    const typed = blank.map((draft) => (draft.rowKey === shift ? { ...draft, name: "シフト" } : draft));
    expect(findPositionDraftErrors(typed)?.rows).toEqual({ [shift]: "「シフト」以外の名前を入力してください" });

    const named = blank.map((draft) => (draft.rowKey === shift ? { ...draft, name: "ホール" } : draft));
    expect(findPositionDraftErrors(named)).toBeNull();
  });

  it("名前を変えたかは保存済みの名前と比べ、仮の名前へ初めて名前を付ける場合は数えない", () => {
    const first = toPositionDrafts([unnamed]).map((draft) => ({ ...draft, name: "ホール" }));
    expect(hasRenamedPosition([unnamed], first)).toBe(false);

    const drafts = toPositionDrafts(positions);
    expect(hasRenamedPosition(positions, drafts)).toBe(false);
    expect(
      hasRenamedPosition(
        positions,
        drafts.map((draft) => (draft.rowKey === kitchen ? { ...draft, name: " 厨房 " } : draft)),
      ),
    ).toBe(true);
    // 名前を消している途中と、行を削除した場合は、名前の変更として数えない。
    expect(
      hasRenamedPosition(
        positions,
        drafts.map((draft) => (draft.rowKey === kitchen ? { ...draft, name: "" } : draft)),
      ),
    ).toBe(false);
    expect(hasRenamedPosition(positions, drafts.slice(0, 1))).toBe(false);
  });
});

describe("ポジションの編集", () => {
  const drafts = toPositionDrafts(positions);
  const names = (items: readonly PositionDraft[]) => items.map((item) => item.name);

  it("新しく足す行には、まだ使っていない色が入る", () => {
    expect(pickUnusedPositionColor(drafts)).toBe("#f472b6");

    const added = addPositionDraft(drafts, "new-1");
    expect(added.at(-1)).toEqual({ rowKey: "new-1", name: "", color: "#f472b6", isDefault: false });
  });

  it("以前の色を使っている行は、同じ並びの今の色を使っているものとして数える", () => {
    // 以前の青（#3b82f6）とオレンジ（#c2410c）の隣へ、よく似た今の青とオレンジを足さない。
    const legacyDrafts = toPositionDrafts([
      { _id: hall, name: "ホール", color: "#3b82f6", isDefault: true },
      { _id: kitchen, name: "キッチン", color: "#c2410c", isDefault: false },
    ]);

    expect(pickUnusedPositionColor(legacyDrafts)).toBe("#a78bfa");
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

  it("つかんだ行を、重ねた行の位置へ動かす", () => {
    expect(names(reorderPositionDrafts(drafts, hall, register))).toEqual(["キッチン", "レジ", "ホール"]);
    expect(names(reorderPositionDrafts(drafts, register, hall))).toEqual(["レジ", "ホール", "キッチン"]);
    expect(names(reorderPositionDrafts(drafts, kitchen, register))).toEqual(["ホール", "レジ", "キッチン"]);
    // 同じ行へ重ねた場合と、一覧にない行は、並びを変えない。
    expect(names(reorderPositionDrafts(drafts, hall, hall))).toEqual(["ホール", "キッチン", "レジ"]);
    expect(names(reorderPositionDrafts(drafts, "unknown", hall))).toEqual(["ホール", "キッチン", "レジ"]);
  });

  it("すべて削除して決定すると、既定のポジションを仮の名前へ戻して1件だけ残す", () => {
    expect(findPositionDraftErrors([])).toBeNull();
    expect(toUnsplitPositionInputs(positions)).toEqual([{ id: hall, name: "シフト", color: "#60a5fa" }]);
    // 既定のポジションが見つからない場合は、先頭を残す。ポジションのない店舗では何も残さない。
    expect(toUnsplitPositionInputs(positions.slice(1))).toEqual([{ id: kitchen, name: "シフト", color: "#fb923c" }]);
    expect(toUnsplitPositionInputs([])).toEqual([]);
  });

  it("保存する形では、保存済みの行だけがidを持ち、名前の前後の空白を除く", () => {
    const inputs = toPositionInputs([
      ...drafts.slice(0, 1),
      { rowKey: "new-1", name: " デリバリー ", color: "#f472b6", isDefault: false },
    ]);

    expect(inputs).toEqual([
      { id: hall, name: "ホール", color: "#60a5fa" },
      { name: "デリバリー", color: "#f472b6" },
    ]);
  });

  it("誤りを、空の名前の行と、重複した名前の行へ振り分ける", () => {
    expect(findPositionDraftErrors(drafts)).toBeNull();

    const errors = findPositionDraftErrors([
      ...drafts,
      { rowKey: "empty", name: "  ", color: "#f472b6", isDefault: false },
      { rowKey: "duplicated", name: "キッチン", color: "#eda40a", isDefault: false },
    ]);

    expect(errors).toEqual({
      rows: { empty: "ポジション名を入力してください", duplicated: "ポジション名が重複しています" },
    });
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
