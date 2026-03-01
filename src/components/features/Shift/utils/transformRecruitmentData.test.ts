import { describe, expect, test } from "vitest";
import {
  generateDateRange,
  mergeAssignments,
  parseTimeRange,
  transformPositions,
  transformShiftRequests,
  transformStaffs,
} from "./transformRecruitmentData";

describe("generateDateRange", () => {
  test("1日のみ", () => {
    expect(generateDateRange("2026-01-01", "2026-01-01")).toEqual(["2026-01-01"]);
  });

  test("複数日", () => {
    expect(generateDateRange("2026-01-01", "2026-01-03")).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  test("月跨ぎ", () => {
    expect(generateDateRange("2026-01-30", "2026-02-01")).toEqual(["2026-01-30", "2026-01-31", "2026-02-01"]);
  });
});

describe("parseTimeRange", () => {
  test("標準的な営業時間", () => {
    expect(parseTimeRange({ openTime: "09:00", closeTime: "22:00", timeUnit: 30 })).toEqual({
      start: 9,
      end: 22,
      unit: 30,
    });
  });

  test("深夜営業", () => {
    expect(parseTimeRange({ openTime: "17:00", closeTime: "02:00", timeUnit: 60 })).toEqual({
      start: 17,
      end: 2,
      unit: 60,
    });
  });
});

describe("transformStaffs", () => {
  const staffList = [
    { _id: "s1", displayName: "田中太郎", status: "active" },
    { _id: "s2", displayName: "山田花子", status: "active" },
    { _id: "s3", displayName: "佐藤一郎", status: "resigned" },
  ];

  test("提出済み判定と退職者除外", () => {
    const shiftRequests = [{ _id: "r1", staffId: "s1", entries: [] }];
    const result = transformStaffs({ staffList, shiftRequests });
    expect(result).toEqual([
      { id: "s1", name: "田中太郎", isSubmitted: true },
      { id: "s2", name: "山田花子", isSubmitted: false },
    ]);
  });

  test("申請なしの場合は全員未提出", () => {
    const result = transformStaffs({ staffList, shiftRequests: [] });
    expect(result).toHaveLength(2);
    expect(result.every((s) => !s.isSubmitted)).toBe(true);
  });
});

describe("transformPositions", () => {
  test("color ありはそのまま使用", () => {
    const positions = [{ _id: "p1", name: "ホール", color: "#ff0000", order: 0 }];
    expect(transformPositions(positions)).toEqual([{ id: "p1", name: "ホール", color: "#ff0000" }]);
  });

  test("color なしはフォールバック", () => {
    const positions = [{ _id: "p1", name: "ホール", color: undefined, order: 0 }];
    const result = transformPositions(positions);
    expect(result[0].color).toBe("#3b82f6"); // POSITION_COLORS[0]
  });

  test("空配列", () => {
    expect(transformPositions([])).toEqual([]);
  });
});

describe("transformShiftRequests", () => {
  const staffList = [
    { _id: "s1", displayName: "田中太郎", status: "active" },
    { _id: "s2", displayName: "山田花子", status: "active" },
  ];
  const positions = [{ id: "p1", name: "ホール", color: "#3b82f6" }];

  test("isAvailable=true のエントリのみ変換", () => {
    const shiftRequests = [
      {
        _id: "r1",
        staffId: "s1",
        entries: [
          { date: "2026-01-01", isAvailable: true, startTime: "09:00", endTime: "17:00" },
          { date: "2026-01-02", isAvailable: false },
        ],
      },
    ];
    const result = transformShiftRequests({ shiftRequests, staffList, positions });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "s1_2026-01-01",
      staffId: "s1",
      staffName: "田中太郎",
      date: "2026-01-01",
      requestedTime: { start: "09:00", end: "17:00" },
      positions: [],
    });
  });

  test("時間なしの場合は requestedTime が null", () => {
    const shiftRequests = [
      {
        _id: "r1",
        staffId: "s1",
        entries: [{ date: "2026-01-01", isAvailable: true }],
      },
    ];
    const result = transformShiftRequests({ shiftRequests, staffList, positions });
    expect(result[0].requestedTime).toBeNull();
  });
});

describe("mergeAssignments", () => {
  const staffList = [
    { _id: "s1", displayName: "田中太郎", status: "active" },
    { _id: "s2", displayName: "山田花子", status: "active" },
  ];

  const baseShifts = [
    {
      id: "s1_2026-01-01",
      staffId: "s1",
      staffName: "田中太郎",
      date: "2026-01-01",
      requestedTime: { start: "09:00", end: "17:00" },
      positions: [],
    },
  ];

  test("assignments が null なら baseShifts をそのまま返す", () => {
    const result = mergeAssignments({ baseShifts, assignments: null, staffList });
    expect(result).toEqual(baseShifts);
  });

  test("既存シフトのポジションを上書き", () => {
    const assignments = {
      assignments: [
        {
          staffId: "s1",
          date: "2026-01-01",
          positions: [{ positionId: "p1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "13:00" }],
        },
      ],
    };
    const result = mergeAssignments({ baseShifts, assignments, staffList });
    expect(result).toHaveLength(1);
    expect(result[0].positions).toHaveLength(1);
    expect(result[0].positions[0].positionName).toBe("ホール");
    expect(result[0].positions[0].start).toBe("09:00");
  });

  test("管理者が追加したシフトが追加される", () => {
    const assignments = {
      assignments: [
        {
          staffId: "s2",
          date: "2026-01-01",
          positions: [{ positionId: "p1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "14:00" }],
        },
      ],
    };
    const result = mergeAssignments({ baseShifts, assignments, staffList });
    expect(result).toHaveLength(2);
    const added = result.find((s) => s.staffId === "s2");
    expect(added).toBeDefined();
    expect(added?.staffName).toBe("山田花子");
    expect(added?.requestedTime).toBeNull();
    expect(added?.positions).toHaveLength(1);
  });

  test("空ポジションの assignment は追加しない", () => {
    const assignments = {
      assignments: [{ staffId: "s2", date: "2026-01-01", positions: [] }],
    };
    const result = mergeAssignments({ baseShifts, assignments, staffList });
    expect(result).toHaveLength(1);
  });
});
