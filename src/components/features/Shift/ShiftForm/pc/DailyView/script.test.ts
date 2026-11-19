import { describe, expect, it } from "vitest";
import { timeToMinutes } from "@/src/domains/shift/time";
import type { PositionType, ShiftData } from "@/src/domains/shift/types";
import { buildRangeAssignMenuViewModel, buildShiftPopoverViewModel, toRangeAssignment } from "./script";

describe("buildShiftPopoverViewModel", () => {
  it("休憩のポジションを除いた勤務を、開始順に表示値へ変換する", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        { id: "work-2", positionId: "default", positionName: "勤務", color: "#000", start: "13:00", end: "17:00" },
        { id: "break", positionId: "break", positionName: "休憩", color: "#000", start: "12:00", end: "13:00" },
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "12:00" },
      ],
    };

    expect(buildShiftPopoverViewModel({ shift })).toEqual({
      segments: [
        { id: "work-1", timeLabel: "09:00〜12:00", positionName: "勤務", color: "#000" },
        { id: "work-2", timeLabel: "13:00〜17:00", positionName: "勤務", color: "#000" },
      ],
      breakLabels: [],
    });
  });

  it("時刻で入れた休憩を、勤務時間の内側だけ開始順に表示値へ変換する", () => {
    const viewModel = buildShiftPopoverViewModel({
      shift: {
        id: "shift-1",
        staffId: "staff-1",
        staffName: "佐藤",
        date: "2026-07-20",
        requestedTime: null,
        positions: [
          { id: "work-1", positionId: "hall", positionName: "ホール", color: "#111", start: "10:00", end: "19:00" },
        ],
        breaks: [
          { start: "16:00", end: "16:15" },
          { start: "12:00", end: "13:00" },
          { start: "19:00", end: "19:30" },
        ],
      },
    });

    expect(viewModel.segments).toEqual([
      { id: "work-1", timeLabel: "10:00〜19:00", positionName: "ホール", color: "#111" },
    ]);
    expect(viewModel.breakLabels).toEqual(["12:00〜13:00", "16:00〜16:15"]);
  });

  describe("ポジションの違う隣り合う勤務", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        {
          id: "kitchen-1",
          positionId: "kitchen",
          positionName: "キッチン",
          color: "#222",
          start: "12:00",
          end: "15:30",
        },
        { id: "hall-1", positionId: "hall", positionName: "ホール", color: "#111", start: "06:30", end: "12:00" },
        { id: "hall-2", positionId: "hall", positionName: "ホール", color: "#111", start: "16:00", end: "19:30" },
      ],
    };
    const project = (mergesAcrossPositions: boolean) =>
      buildShiftPopoverViewModel({ shift, mergesAcrossPositions }).segments.map((segment) => segment.timeLabel);

    it("ポジションを見せない表示では、続いた1つの勤務時間にまとめ、間の空いた勤務は分けたままにする", () => {
      expect(project(true)).toEqual(["06:30〜15:30", "16:00〜19:30"]);
    });

    it("ポジションを見せる表示では、ポジションごとの区間のまま出す", () => {
      expect(project(false)).toEqual(["06:30〜12:00", "12:00〜15:30", "16:00〜19:30"]);
    });
  });
});

describe("buildRangeAssignMenuViewModel", () => {
  const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
  const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };
  const segment = (position: PositionType, start: string, end: string) => ({
    id: `seg-${start}`,
    positionId: position.id,
    positionName: position.name,
    color: position.color,
    start,
    end,
  });
  // ホール 10:00〜14:00（12:00〜13:00は休憩）、キッチン 14:00〜18:00。
  const shift: ShiftData = {
    id: "shift-1",
    staffId: "staff-1",
    staffName: "田中",
    date: "2026-06-01",
    requestedTime: null,
    positions: [segment(hall, "10:00", "14:00"), segment(kitchen, "14:00", "18:00")],
    breaks: [{ start: "12:00", end: "13:00" }],
  };
  const build = (start: string, end: string, positions: PositionType[] = [hall, kitchen], showsPositions = true) =>
    buildRangeAssignMenuViewModel({
      shift,
      range: { start: timeToMinutes(start), end: timeToMinutes(end) },
      positions,
      showsPositions,
    });
  // シンプル表示と、ポジションが1つの店舗。
  const buildWithoutPositions = (start: string, end: string) => build(start, end, [hall, kitchen], false);

  it("選んだ範囲の時間、表示順のポジションと数字のキー、いま入っているポジションを返す", () => {
    expect(build("10:00", "11:30")).toEqual({
      timeLabel: "10:00〜11:30",
      checkedValue: "position:hall",
      positions: [
        { value: "position:hall", name: "ホール", color: "#60a5fa", shortcut: "1" },
        { value: "position:kitchen", name: "キッチン", color: "#fb923c", shortcut: "2" },
      ],
      isBreakDisabled: false,
      breakEditorLabel: "休憩を時刻で追加",
      deleteTarget: { segmentIds: ["seg-10:00"], timeLabel: "10:00〜14:00" },
    });
  });

  it("休憩だけを選んだ範囲は、休憩にチェックを出し、休憩を選べるままにする", () => {
    expect(build("12:00", "13:00")).toMatchObject({ checkedValue: "break", isBreakDisabled: false });
  });

  it("休憩の編集を開く項目は、休憩だけを選んだ範囲では「変更」、勤務を含む範囲では「追加」と出す", () => {
    expect(build("12:00", "13:00").breakEditorLabel).toBe("休憩を時刻で変更");
    expect(build("12:30", "13:00").breakEditorLabel).toBe("休憩を時刻で変更");
    expect(build("11:00", "13:00").breakEditorLabel).toBe("休憩を時刻で追加");
    expect(buildWithoutPositions("12:00", "13:00").breakEditorLabel).toBe("休憩を時刻で変更");
  });

  it("ポジションが混ざる範囲は、どれにもチェックを出さず、かかる区間をすべて削除の対象にする", () => {
    expect(build("13:00", "15:00")).toMatchObject({
      checkedValue: null,
      deleteTarget: { segmentIds: ["seg-10:00", "seg-14:00"], timeLabel: "10:00〜18:00" },
    });
  });

  it("ひと続きの勤務の全体を選んだ範囲は、休憩を選べない", () => {
    expect(build("10:00", "18:00").isBreakDisabled).toBe(true);
  });

  it("数字のキーは9番目までに付ける", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ ...kitchen, id: `position-${index}` }));

    expect(build("10:00", "11:00", many).positions.map((position) => position.shortcut)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      null,
    ]);
  });

  describe("ポジションを塗り分けない表示（シンプル表示、ポジションが1つの店舗）", () => {
    it("ポジションの代わりに「勤務」を、色の丸なしで出す", () => {
      expect(buildWithoutPositions("10:00", "11:00").positions).toEqual([
        { value: "work", name: "勤務", color: null, shortcut: "1" },
      ]);
    });

    it("ポジションが混ざっていても、勤務だけの範囲は「勤務」にチェックを出す", () => {
      expect(buildWithoutPositions("13:00", "15:00").checkedValue).toBe("work");
    });

    it("休憩だけの範囲は「休憩」にチェックを出し、勤務と休憩が混ざる範囲はどれにも出さない", () => {
      expect(buildWithoutPositions("12:00", "13:00").checkedValue).toBe("break");
      expect(buildWithoutPositions("11:00", "13:00").checkedValue).toBeNull();
    });

    it("選んだ範囲を含むひと続きの勤務を、ポジションの違う区間もまとめて、削除の対象にする", () => {
      expect(buildWithoutPositions("10:00", "11:30").deleteTarget).toEqual({
        segmentIds: ["seg-10:00", "seg-14:00"],
        timeLabel: "10:00〜18:00",
      });
    });
  });

  it("メニューで選んだ値を、範囲へ入れるものへ直す", () => {
    expect(toRangeAssignment("break")).toEqual({ kind: "break" });
    // 「勤務」は、休憩を選んだ範囲から休憩を外す。
    expect(toRangeAssignment("work")).toEqual({ kind: "removeBreak" });
    expect(toRangeAssignment("position:kitchen")).toEqual({ kind: "position", positionId: "kitchen" });
  });
});
