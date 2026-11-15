import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { POSITION_COLOR_PALETTE } from "@/convex/constants";
import {
  addPositionDraft,
  canMovePositionDraft,
  findPositionDraftErrors,
  formatBreakRule,
  formatDurationMinutes,
  formatPendingSections,
  getBreakRuleBreakOptions,
  getBreakRuleWorkOptions,
  getRemovedPositionNames,
  isLastAvailablePosition,
  movePositionDraft,
  type PositionDraft,
  parseBreakRuleForm,
  pickUnusedPositionColor,
  toggleStaffPosition,
  toPositionDrafts,
  toPositionInputs,
  toStaffProfileInputs,
} from "./script";
import type { ShiftSetupPosition, ShiftSetupStaff } from "./types";

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

  it("最初からあるポジションは先頭から動かせず、ほかの行もその上へは動かせない", () => {
    expect(canMovePositionDraft(drafts, 0, 1)).toBe(false);
    expect(canMovePositionDraft(drafts, 1, -1)).toBe(false);
    expect(canMovePositionDraft(drafts, 2, 1)).toBe(false);
    expect(names(movePositionDraft(drafts, 1, -1))).toEqual(["ホール", "キッチン", "レジ"]);

    expect(names(movePositionDraft(drafts, 1, 1))).toEqual(["ホール", "レジ", "キッチン"]);
    expect(names(movePositionDraft(drafts, 2, -1))).toEqual(["ホール", "レジ", "キッチン"]);
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

describe("スタッフの条件", () => {
  const staff = (id: string, overrides: Partial<ShiftSetupStaff> = {}): ShiftSetupStaff => ({
    _id: id as Id<"staffs">,
    name: id,
    unavailablePositionIds: [],
    skillLevel: "standard",
    ...overrides,
  });

  it("入れるポジションを外し、もう一度押すと入れ直せる", () => {
    const removed = toggleStaffPosition({ unavailablePositionIds: [], skillLevel: "standard" }, kitchen, positions);
    expect(removed.unavailablePositionIds).toEqual([kitchen]);

    expect(toggleStaffPosition(removed, kitchen, positions).unavailablePositionIds).toEqual([]);
  });

  it("最後に残った1つは外せない", () => {
    const onlyHall = { unavailablePositionIds: [kitchen, register], skillLevel: "standard" as const };

    expect(isLastAvailablePosition(onlyHall, hall, positions)).toBe(true);
    expect(isLastAvailablePosition(onlyHall, kitchen, positions)).toBe(false);
    expect(toggleStaffPosition(onlyHall, hall, positions)).toBe(onlyHall);

    const twoLeft = { unavailablePositionIds: [register], skillLevel: "standard" as const };
    expect(isLastAvailablePosition(twoLeft, hall, positions)).toBe(false);
  });

  it("削除済みのポジションは、残りの数に数えない", () => {
    const removedPosition = "position-removed" as Id<"positions">;
    const profile = { unavailablePositionIds: [removedPosition, kitchen], skillLevel: "standard" as const };

    // 有効な3つのうち外しているのはキッチンだけなので、ホールはまだ外せる。
    expect(isLastAvailablePosition(profile, hall, positions)).toBe(false);
  });

  it("保存済みの値から変えたスタッフだけを、ポジションの並び順にそろえて返す", () => {
    const staffs = [
      staff("staff-1"),
      staff("staff-2", { unavailablePositionIds: [kitchen] }),
      staff("staff-3", { skillLevel: "lead" }),
      staff("staff-4"),
    ];
    const removedPosition = "position-removed" as Id<"positions">;

    const inputs = toStaffProfileInputs(
      staffs,
      {
        "staff-1": { unavailablePositionIds: [register, removedPosition, kitchen], skillLevel: "standard" },
        // 保存済みと同じ内容は送らない。
        "staff-2": { unavailablePositionIds: [kitchen], skillLevel: "standard" },
        "staff-3": { unavailablePositionIds: [], skillLevel: "newcomer" },
        // 一覧にいないスタッフの編集中の値は送らない。
        "staff-gone": { unavailablePositionIds: [kitchen], skillLevel: "lead" },
      },
      positions,
    );

    expect(inputs).toEqual([
      { staffId: "staff-1", unavailablePositionIds: [kitchen, register], skillLevel: "standard" },
      { staffId: "staff-3", unavailablePositionIds: [], skillLevel: "newcomer" },
    ]);
  });
});

describe("休憩の決まり", () => {
  it("分を時間と分の表記へ直す", () => {
    expect(formatDurationMinutes(45)).toBe("45分");
    expect(formatDurationMinutes(60)).toBe("1時間");
    expect(formatDurationMinutes(390)).toBe("6時間30分");
  });

  it("決まりを1文で表し、決まりがなければ「決まりなし」と表す", () => {
    expect(formatBreakRule({ minWorkMinutes: 360, breakMinutes: 45 })).toBe("6時間以上の勤務に45分");
    expect(formatBreakRule(null)).toBe("決まりなし");
  });

  it("勤務の長さは30分単位、休憩の長さは15分単位の選択肢を出す", () => {
    const work = getBreakRuleWorkOptions().map((option) => option.value);
    expect(work.slice(0, 3)).toEqual(["60", "90", "120"]);
    expect(work.at(-1)).toBe("720");

    const breaks = getBreakRuleBreakOptions().map((option) => option.value);
    expect(breaks).toEqual(["15", "30", "45", "60", "75", "90", "105", "120"]);
  });

  it("選択肢の範囲外で保存済みの値も、選択肢に含める", () => {
    expect(getBreakRuleWorkOptions(30)[0]).toEqual({ value: "30", label: "30分" });
    expect(getBreakRuleBreakOptions(180).at(-1)).toEqual({ value: "180", label: "3時間" });
    // 範囲内の値は重複させない。
    expect(getBreakRuleBreakOptions(45)).toHaveLength(8);
  });

  it("選んだ値を決まりへ直し、選んでいない項目と勤務より長い休憩を誤りにする", () => {
    expect(parseBreakRuleForm({ minWorkMinutes: "360", breakMinutes: "45" })).toEqual({
      rule: { minWorkMinutes: 360, breakMinutes: 45 },
    });
    expect(parseBreakRuleForm({ minWorkMinutes: "", breakMinutes: "" })).toEqual({
      errors: { minWorkMinutes: "勤務の長さを選んでください", breakMinutes: "休憩の長さを選んでください" },
    });
    expect(parseBreakRuleForm({ minWorkMinutes: "60", breakMinutes: "60" })).toEqual({
      errors: { breakMinutes: "休憩は勤務より短くしてください" },
    });
  });
});

describe("保存していない変更の表示", () => {
  it("変更のあるセクションの名前を「と」でつなぐ", () => {
    expect(formatPendingSections(["dayTemplates"])).toBe("必要人数");
    expect(formatPendingSections(["staffs"])).toBe("スタッフ");
    expect(formatPendingSections(["dayTemplates", "staffs"])).toBe("必要人数とスタッフ");
  });
});
