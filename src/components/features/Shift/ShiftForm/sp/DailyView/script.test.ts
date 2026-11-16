import { describe, expect, it } from "vitest";
import type { PositionSegment, PositionType, ShiftData } from "@/src/domains/shift/types";
import {
  buildSPDailyCardViewModel,
  buildSPShiftEditNewRow,
  buildSPShiftEditResult,
  findSPShiftEditErrors,
  getAssignedRange,
  getSPShiftEditBreakLabels,
  getSPShiftEditLayout,
  getSPShiftEditRows,
  type SPShiftEditRow,
  timeToPercentage,
} from "./script";

const blankRow = { key: "new-row", positionId: "position-default" };

const work = (id: string, start: string, end: string, positionId = "position-1"): PositionSegment => ({
  id,
  positionId,
  positionName: positionId === "position-1" ? "ホール" : "キッチン",
  color: positionId === "position-1" ? "#123456" : "#abcdef",
  start,
  end,
});

const shiftOf = (positions: PositionSegment[], extra: Partial<ShiftData> = {}): ShiftData => ({
  id: "shift-1",
  staffId: "staff-1",
  staffName: "田中",
  date: "2026-06-01",
  requestedTime: null,
  positions,
  ...extra,
});

const row = (key: string, startTime: string, endTime: string, positionId = "position-1"): SPShiftEditRow => ({
  key,
  startTime,
  endTime,
  positionId,
});

const positions: PositionType[] = [
  { id: "position-other", name: "キッチン", color: "#abcdef", isDefault: false },
  { id: "position-default", name: "ホール", color: "#123456", isDefault: true },
];

describe("getSPShiftEditRows", () => {
  it("勤務がない日は、空の1行を出す", () => {
    expect(getSPShiftEditRows(undefined, blankRow)).toEqual([
      { key: "new-row", startTime: "", endTime: "", positionId: "position-default" },
    ]);
  });

  it("休憩を除いた勤務区間を、開始順の行にする", () => {
    const shift = shiftOf([
      work("work-2", "14:00", "17:00", "position-2"),
      {
        id: "break-by-name",
        positionId: "legacy-break",
        positionName: "休憩",
        color: "#000",
        start: "12:00",
        end: "14:00",
      },
      work("work-1", "10:00", "12:00"),
      { id: "break-by-id", positionId: "break", positionName: "中抜け", color: "#000", start: "17:00", end: "18:00" },
    ]);

    expect(getSPShiftEditRows(shift, blankRow)).toEqual([
      row("work-1", "10:00", "12:00"),
      row("work-2", "14:00", "17:00", "position-2"),
    ]);
  });
});

describe("getSPShiftEditLayout", () => {
  const oneRange = shiftOf([work("work-1", "10:00", "17:00")]);
  const twoRanges = shiftOf([work("work-1", "10:00", "12:00"), work("work-2", "14:00", "17:00")]);
  const simple = { detailMode: false, hasAddedRow: false };

  it("シンプル表示で勤務が0件または1件の日は、従来の形にする", () => {
    expect(getSPShiftEditLayout({ ...simple, shift: undefined })).toBe("single");
    expect(getSPShiftEditLayout({ ...simple, shift: oneRange })).toBe("single");
  });

  it("勤務が2件以上の日は、シンプル表示でも複数行の形にする", () => {
    expect(getSPShiftEditLayout({ ...simple, shift: twoRanges })).toBe("multiple");
  });

  it("休憩の区間は勤務の件数に数えない", () => {
    const shift = shiftOf([
      work("work-1", "10:00", "12:00"),
      { id: "break", positionId: "break", positionName: "休憩", color: "#000", start: "12:00", end: "13:00" },
    ]);

    expect(getSPShiftEditLayout({ ...simple, shift })).toBe("single");
  });

  it("シンプル表示で勤務が0件または1件の日も、行を足したあとは複数行の形にする", () => {
    expect(getSPShiftEditLayout({ shift: undefined, detailMode: false, hasAddedRow: true })).toBe("multiple");
    expect(getSPShiftEditLayout({ shift: oneRange, detailMode: false, hasAddedRow: true })).toBe("multiple");
  });

  it("くわしく表示では、勤務が0件でも1件でも複数行の形にする", () => {
    expect(getSPShiftEditLayout({ shift: undefined, detailMode: true, hasAddedRow: false })).toBe("multiple");
    expect(getSPShiftEditLayout({ shift: oneRange, detailMode: true, hasAddedRow: false })).toBe("multiple");
  });
});

describe("buildSPShiftEditNewRow", () => {
  it("最も遅い終了時刻を開始に入れ、終了は空にする", () => {
    const rows = [row("work-2", "14:00", "17:00"), row("work-1", "10:00", "12:00")];

    expect(buildSPShiftEditNewRow({ rows, key: "new-1", positionId: "position-2", latestEndTime: "22:00" })).toEqual({
      key: "new-1",
      startTime: "17:00",
      endTime: "",
      positionId: "position-2",
    });
  });

  it("最も遅い終了時刻が選べる最後の時刻なら、続きを入れられないため開始も空にする", () => {
    const rows = [row("work-1", "10:00", "22:00")];

    expect(
      buildSPShiftEditNewRow({ rows, key: "new-1", positionId: "position-1", latestEndTime: "22:00" }).startTime,
    ).toBe("");
    expect(
      buildSPShiftEditNewRow({ rows, key: "new-1", positionId: "position-1", latestEndTime: "22:30" }).startTime,
    ).toBe("22:00");
  });

  it("行がない、または終了が未入力の行だけなら、開始も空にする", () => {
    expect(
      buildSPShiftEditNewRow({ rows: [], key: "new-1", positionId: "position-1", latestEndTime: "22:00" }).startTime,
    ).toBe("");
    expect(
      buildSPShiftEditNewRow({
        rows: [row("new-0", "10:00", "")],
        key: "new-1",
        positionId: "position-1",
        latestEndTime: "22:00",
      }).startTime,
    ).toBe("");
  });
});

describe("findSPShiftEditErrors", () => {
  it("隣り合う行と離れた行は通す", () => {
    expect(
      findSPShiftEditErrors([row("a", "10:00", "12:00"), row("b", "12:00", "14:00"), row("c", "15:00", "17:00")]),
    ).toBeNull();
  });

  it("行がなければ通す", () => {
    expect(findSPShiftEditErrors([])).toBeNull();
  });

  it("1分でも重なる行は、入力順にかかわらず重なりとして返す", () => {
    expect(findSPShiftEditErrors([row("b", "11:30", "14:00"), row("a", "10:00", "12:00")])).toEqual({
      rows: {},
      overlap: "勤務時間が重なっています",
    });
  });

  it("未入力と、開始が終了以降の行は、行ごとの文言で返す", () => {
    expect(
      findSPShiftEditErrors([
        row("empty", "", ""),
        row("no-end", "10:00", ""),
        row("same", "12:00", "12:00"),
        row("reversed", "15:00", "14:00"),
        row("valid", "16:00", "17:00"),
      ]),
    ).toEqual({
      rows: {
        empty: { startTime: "開始時間を選択してください", endTime: "終了時間を選択してください" },
        "no-end": { endTime: "終了時間を選択してください" },
        same: { endTime: "終了時間は開始時間より後にしてください" },
        reversed: { endTime: "終了時間は開始時間より後にしてください" },
      },
      overlap: null,
    });
  });

  it("未入力の行は重なりの判定から外し、入力済みの行どうしの重なりだけを返す", () => {
    expect(
      findSPShiftEditErrors([row("a", "10:00", "13:00"), row("b", "12:00", ""), row("c", "12:30", "14:00")]),
    ).toEqual({
      rows: { b: { endTime: "終了時間を選択してください" } },
      overlap: "勤務時間が重なっています",
    });
  });
});

describe("getSPShiftEditBreakLabels", () => {
  it("入力が済んだ行が1つもなければ、休憩を入れられないためnullを返す", () => {
    expect(getSPShiftEditBreakLabels([row("new", "10:00", "")], [{ start: "12:00", end: "13:00" }])).toBeNull();
    expect(getSPShiftEditBreakLabels([], undefined)).toBeNull();
  });

  it("入力中の勤務時間の内側に収まる休憩だけを返す", () => {
    const breaks = [
      { start: "12:00", end: "13:00" },
      { start: "17:30", end: "18:30" },
    ];

    expect(getSPShiftEditBreakLabels([row("a", "10:00", "18:00")], breaks)).toEqual(["12:00〜13:00", "17:30〜18:00"]);
    expect(getSPShiftEditBreakLabels([row("a", "10:00", "12:30")], breaks)).toEqual(["12:00〜12:30"]);
  });

  it("休憩がない日は空で返す", () => {
    expect(getSPShiftEditBreakLabels([row("a", "10:00", "18:00")], undefined)).toEqual([]);
  });
});

describe("buildSPShiftEditResult", () => {
  it("勤務がない日の新しい行は、行に選んだポジションで作る", () => {
    const shift = shiftOf(
      [{ id: "break-only", positionId: "break", positionName: "休憩", color: "#000", start: "12:00", end: "13:00" }],
      { requestedTime: { start: "10:00", end: "18:00" }, requestedTimes: [{ start: "10:00", end: "18:00" }] },
    );

    const result = buildSPShiftEditResult({
      shift,
      rows: [row("new-segment", "11:00", "17:00", "position-default")],
      positions,
    });

    expect(result).toEqual({
      kind: "updated",
      shift: {
        ...shift,
        positions: [
          {
            id: "new-segment",
            positionId: "position-default",
            positionName: "ホール",
            color: "#123456",
            start: "11:00",
            end: "17:00",
          },
        ],
      },
    });
  });

  it("行のポジションが店舗にない場合は、店舗の既定のポジションで作る", () => {
    const result = buildSPShiftEditResult({
      shift: shiftOf([]),
      rows: [row("new-segment", "11:00", "17:00", "deleted-position")],
      positions,
    });

    expect(result.kind === "updated" && result.shift.positions).toEqual([
      {
        id: "new-segment",
        positionId: "position-default",
        positionName: "ホール",
        color: "#123456",
        start: "11:00",
        end: "17:00",
      },
    ]);
  });

  it("ポジションを変えていない行は、IDとポジションと希望・休憩・仮の印を保ったまま時刻だけ置き換える", () => {
    const shift = shiftOf(
      [
        { id: "break-before", positionId: "break", positionName: "休憩", color: "#000", start: "11:00", end: "12:00" },
        work("work-1", "12:00", "14:00"),
        {
          id: "break-after",
          positionId: "legacy-break",
          positionName: "休憩",
          color: "#000",
          start: "14:00",
          end: "15:00",
        },
      ],
      {
        requestedTime: { start: "12:00", end: "14:00" },
        requestedTimes: [{ start: "12:00", end: "14:00" }],
        requestedShiftTypeOptionIds: ["legacy-request"],
        breaks: [{ start: "12:30", end: "12:45" }],
        isProvisional: true,
      },
    );
    const originalShift = structuredClone(shift);

    const result = buildSPShiftEditResult({ shift, rows: [row("work-1", "12:00", "13:00")], positions: [] });

    expect(result).toEqual({ kind: "updated", shift: { ...shift, positions: [work("work-1", "12:00", "13:00")] } });
    expect(shift).toEqual(originalShift);
  });

  it("複数行は開始順に並べ、行ごとに変えた時刻とポジションを反映する", () => {
    const shift = shiftOf([work("work-1", "10:00", "12:00"), work("work-2", "14:00", "17:00")]);

    const result = buildSPShiftEditResult({
      shift,
      rows: [
        row("work-1", "10:00", "12:00"),
        row("work-2", "15:00", "18:00", "position-other"),
        row("new-1", "08:00", "09:00", "position-other"),
      ],
      positions,
    });

    expect(result.kind === "updated" && result.shift.positions).toEqual([
      {
        id: "new-1",
        positionId: "position-other",
        positionName: "キッチン",
        color: "#abcdef",
        start: "08:00",
        end: "09:00",
      },
      work("work-1", "10:00", "12:00"),
      {
        id: "work-2",
        positionId: "position-other",
        positionName: "キッチン",
        color: "#abcdef",
        start: "15:00",
        end: "18:00",
      },
    ]);
  });

  it("同じポジションで隣り合う行は1件にまとめ、別のポジションの行はまとめない", () => {
    const shift = shiftOf([work("work-1", "10:00", "12:00"), work("work-2", "14:00", "17:00")]);

    const merged = buildSPShiftEditResult({
      shift,
      rows: [row("work-1", "10:00", "14:00"), row("work-2", "14:00", "17:00")],
      positions,
    });
    const separated = buildSPShiftEditResult({
      shift,
      rows: [row("work-1", "10:00", "14:00"), row("work-2", "14:00", "17:00", "position-other")],
      positions,
    });

    expect(merged.kind === "updated" && merged.shift.positions).toEqual([work("work-1", "10:00", "17:00")]);
    expect(
      separated.kind === "updated" && separated.shift.positions.map(({ id, start, end }) => ({ id, start, end })),
    ).toEqual([
      { id: "work-1", start: "10:00", end: "14:00" },
      { id: "work-2", start: "14:00", end: "17:00" },
    ]);
  });

  it("行をすべて消した場合は、勤務を消す結果を返す", () => {
    expect(buildSPShiftEditResult({ shift: shiftOf([work("work-1", "10:00", "12:00")]), rows: [], positions })).toEqual(
      {
        kind: "cleared",
      },
    );
  });
});

describe("getAssignedRange", () => {
  it("休憩を除外して勤務範囲を返す", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        { id: "work-2", positionId: "default", positionName: "勤務", color: "#000", start: "13:00", end: "18:00" },
        { id: "break", positionId: "break", positionName: "休憩", color: "#000", start: "12:00", end: "13:00" },
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "12:00" },
      ],
    };

    expect(getAssignedRange(shift)).toEqual(["09:00", "18:00"]);
  });

  it("勤務がなければnullを返す", () => {
    expect(getAssignedRange(undefined)).toBeNull();
  });
});

describe("timeToPercentage", () => {
  it("表示時間内の位置を百分率へ変換する", () => {
    expect(timeToPercentage("13:00", { start: 9, end: 17, unit: 30 })).toBe(50);
  });
});

describe("buildSPDailyCardViewModel", () => {
  it("希望・勤務・勤務間の休憩を描画用の値へ変換する", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: { start: "09:00", end: "17:00" },
      positions: [
        { id: "work-2", positionId: "default", positionName: "勤務", color: "#000", start: "13:00", end: "17:00" },
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "12:00" },
      ],
    };

    const viewModel = buildSPDailyCardViewModel(shift, { start: 9, end: 17, unit: 30 });

    expect(viewModel.assignedTimeLabel).toBe("09:00–17:00");
    expect(viewModel.requestedBars).toEqual([
      { key: "09:00-17:00-0", leftPercentage: 0, widthPercentage: 100, label: null },
    ]);
    expect(viewModel.workBars.map(({ key }) => key)).toEqual(["work-1", "work-2"]);
    expect(viewModel.breakBars).toEqual([{ key: "break-12:00-13:00", leftPercentage: 37.5, widthPercentage: 12.5 }]);
    expect(viewModel.explicitBreakBars).toEqual([]);
  });

  it("勤務のバーにポジションの色と名前を持たせ、時刻で入れた休憩を勤務の内側だけ返す", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        { id: "work-1", positionId: "hall", positionName: "ホール", color: "#111111", start: "09:00", end: "13:00" },
        {
          id: "work-2",
          positionId: "kitchen",
          positionName: "キッチン",
          color: "#222222",
          start: "13:00",
          end: "17:00",
        },
      ],
      breaks: [
        { start: "11:00", end: "12:00" },
        { start: "16:30", end: "17:30" },
      ],
    };

    const viewModel = buildSPDailyCardViewModel(shift, { start: 9, end: 17, unit: 30 });

    expect(viewModel.workBars).toEqual([
      {
        key: "work-1",
        leftPercentage: 0,
        widthPercentage: 50,
        positionId: "hall",
        color: "#111111",
        positionName: "ホール",
        timeLabel: "09:00〜13:00",
      },
      {
        key: "work-2",
        leftPercentage: 50,
        widthPercentage: 50,
        positionId: "kitchen",
        color: "#222222",
        positionName: "キッチン",
        timeLabel: "13:00〜17:00",
      },
    ]);
    expect(viewModel.explicitBreakBars).toEqual([
      { key: "explicit-break-11:00-12:00", leftPercentage: 25, widthPercentage: 12.5 },
      { key: "explicit-break-16:30-17:00", leftPercentage: 93.75, widthPercentage: 6.25 },
    ]);
  });

  it("勤務を外しても希望シフトの時間を点線の中に残す", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: { start: "09:00", end: "13:00" },
      positions: [],
    };

    const viewModel = buildSPDailyCardViewModel(shift, { start: 9, end: 17, unit: 30 });

    expect(viewModel.hasAssignment).toBe(false);
    expect(viewModel.hasRequest).toBe(true);
    expect(viewModel.assignedTimeLabel).toBeNull();
    expect(viewModel.requestedBars).toEqual([
      { key: "09:00-13:00-0", leftPercentage: 0, widthPercentage: 50, label: "希望：09:00-13:00" },
    ]);
    expect(viewModel.workBars).toEqual([]);
  });
});
