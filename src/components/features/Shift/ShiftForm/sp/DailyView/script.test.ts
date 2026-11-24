import { describe, expect, it } from "vitest";
import type { PositionSegment, PositionType, ShiftData } from "@/src/domains/shift/types";
import {
  buildSPDailyCardViewModel,
  buildSPShiftEditNewRow,
  buildSPShiftEditResult,
  findSPShiftEditErrors,
  getAssignedRange,
  getSPShiftEditInitialBreaks,
  getSPShiftEditLayout,
  getSPShiftEditRows,
  getSPShiftEditWorkPositions,
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

describe("getSPShiftEditWorkPositions", () => {
  it("開始と終了が正しく入った行だけを、休憩の基準にする勤務として返す", () => {
    expect(
      getSPShiftEditWorkPositions([row("a", "10:00", "13:00"), row("b", "14:00", ""), row("c", "15:00", "14:00")]).map(
        (position) => [position.id, position.start, position.end],
      ),
    ).toEqual([["a", "10:00", "13:00"]]);
    expect(getSPShiftEditWorkPositions([])).toEqual([]);
  });
});

describe("getSPShiftEditInitialBreaks", () => {
  it("勤務の開始より後、終了より前にある休憩だけを返す", () => {
    const shift = shiftOf([work("a", "10:00", "18:00")], {
      breaks: [
        { start: "12:00", end: "13:00" },
        { start: "17:30", end: "18:30" },
      ],
    });

    // 17:30〜18:30は勤務のお尻にかかり、休憩として扱わないため返さない。
    expect(getSPShiftEditInitialBreaks(shift)).toEqual([{ start: "12:00", end: "13:00" }]);
  });

  it("勤務のない日と、休憩のない日は空で返す", () => {
    expect(getSPShiftEditInitialBreaks(undefined)).toEqual([]);
    expect(getSPShiftEditInitialBreaks(shiftOf([], { breaks: [{ start: "12:00", end: "13:00" }] }))).toEqual([]);
    expect(getSPShiftEditInitialBreaks(shiftOf([work("a", "10:00", "18:00")]))).toEqual([]);
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

  it("ポジションを変えていない行は、IDとポジションと希望・休憩を保ったまま時刻だけ置き換える", () => {
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

  it("休憩を渡すと、重なる休憩と隣り合う休憩を1つにまとめて置き換える", () => {
    const shift = shiftOf([work("a", "10:00", "18:00")], { breaks: [{ start: "15:00", end: "15:30" }] });

    const result = buildSPShiftEditResult({
      shift,
      rows: [row("a", "10:00", "18:00", "position-1")],
      positions,
      breaks: [
        { start: "13:00", end: "13:30" },
        { start: "12:00", end: "13:00" },
      ],
    });

    expect(result.kind === "updated" && result.shift.breaks).toEqual([{ start: "12:00", end: "13:30" }]);
  });

  it("休憩を空で渡すと、その日の休憩を消す。渡さなければそのまま残す", () => {
    const shift = shiftOf([work("a", "10:00", "18:00")], { breaks: [{ start: "12:00", end: "13:00" }] });
    const rows = [row("a", "10:00", "18:00", "position-1")];

    const cleared = buildSPShiftEditResult({ shift, rows, positions, breaks: [] });
    const kept = buildSPShiftEditResult({ shift, rows, positions });

    if (cleared.kind !== "updated" || kept.kind !== "updated") throw new Error("勤務が残るはず");
    expect(Object.hasOwn(cleared.shift, "breaks")).toBe(false);
    expect(kept.shift.breaks).toEqual([{ start: "12:00", end: "13:00" }]);
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

  it("勤務のバーにポジションの色と名前を持たせ、時刻で入れた休憩のうち、勤務の開始より後、終了より前のものを返す", () => {
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
        edgeShape: "start",
      },
      {
        key: "work-2",
        leftPercentage: 50,
        widthPercentage: 50,
        positionId: "kitchen",
        color: "#222222",
        positionName: "キッチン",
        edgeShape: "end",
      },
    ]);
    // 16:30〜17:30は、勤務のお尻からはみ出すため返さない。
    expect(viewModel.explicitBreakBars).toEqual([
      { key: "explicit-break-11:00-12:00", leftPercentage: 25, widthPercentage: 12.5 },
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
    expect(viewModel.detailItems).toEqual([]);
  });
});

describe("buildSPDailyCardViewModel: 内訳とバーの角", () => {
  const timeRange = { start: 9, end: 22, unit: 30 };
  const makeShift = (positions: ShiftData["positions"], breaks?: ShiftData["breaks"]): ShiftData => ({
    id: "shift-1",
    staffId: "staff-1",
    staffName: "田中",
    date: "2026-06-01",
    requestedTime: null,
    positions,
    ...(breaks ? { breaks } : {}),
  });
  const hall = { positionId: "hall", positionName: "ホール", color: "#111111" };
  const kitchen = { positionId: "kitchen", positionName: "キッチン", color: "#222222" };
  const toLabels = (items: ReturnType<typeof buildSPDailyCardViewModel>["detailItems"]) =>
    items.map((item) => (item.kind === "break" ? `休憩 ${item.timeLabel}` : `${item.positionName} ${item.timeLabel}`));

  it("時刻で入れた休憩でポジションの時間を区切り、休憩も1項目にして時刻の順に並べる", () => {
    const viewModel = buildSPDailyCardViewModel(
      makeShift(
        [
          { id: "w1", ...hall, start: "09:00", end: "17:00" },
          { id: "w2", ...kitchen, start: "17:00", end: "19:30" },
          { id: "w3", ...hall, start: "19:30", end: "20:30" },
          { id: "w4", ...kitchen, start: "20:30", end: "21:30" },
        ],
        [
          { start: "13:00", end: "14:45" },
          { start: "15:30", end: "16:00" },
        ],
      ),
      timeRange,
    );

    expect(toLabels(viewModel.detailItems)).toEqual([
      "ホール 09:00〜13:00",
      "休憩 13:00〜14:45",
      "ホール 14:45〜15:30",
      "休憩 15:30〜16:00",
      "ホール 16:00〜17:00",
      "キッチン 17:00〜19:30",
      "ホール 19:30〜20:30",
      "キッチン 20:30〜21:30",
    ]);
  });

  it("勤務の間の空きも休憩の1項目にする", () => {
    const viewModel = buildSPDailyCardViewModel(
      makeShift([
        { id: "w1", ...hall, start: "09:00", end: "12:00" },
        { id: "w2", ...kitchen, start: "13:00", end: "17:00" },
      ]),
      timeRange,
    );

    expect(toLabels(viewModel.detailItems)).toEqual([
      "ホール 09:00〜12:00",
      "休憩 12:00〜13:00",
      "キッチン 13:00〜17:00",
    ]);
  });

  it("隣り合う同じポジションの区間は1項目にまとめる", () => {
    const viewModel = buildSPDailyCardViewModel(
      makeShift([
        { id: "w1", ...hall, start: "09:00", end: "12:00" },
        { id: "w2", ...hall, start: "12:00", end: "15:00" },
      ]),
      timeRange,
    );

    expect(toLabels(viewModel.detailItems)).toEqual(["ホール 09:00〜15:00"]);
  });

  it.each([
    ["勤務が1つ", [{ id: "w1", ...hall, start: "09:00", end: "17:00" }], ["isolated"]],
    [
      "隣り合う勤務が3つ",
      [
        { id: "w1", ...hall, start: "09:00", end: "12:00" },
        { id: "w2", ...kitchen, start: "12:00", end: "15:00" },
        { id: "w3", ...hall, start: "15:00", end: "17:00" },
      ],
      ["start", "middle", "end"],
    ],
    [
      "休憩の空きをはさむ勤務が2つ",
      [
        { id: "w1", ...hall, start: "09:00", end: "12:00" },
        { id: "w2", ...kitchen, start: "13:00", end: "17:00" },
      ],
      ["start", "end"],
    ],
  ])("%sの場合、その日の最初の左端と最後の右端だけを丸める", (_label, positions, expected) => {
    const viewModel = buildSPDailyCardViewModel(makeShift(positions), timeRange);

    expect(viewModel.workBars.map((bar) => bar.edgeShape)).toEqual(expected);
  });
});
