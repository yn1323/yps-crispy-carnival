import { describe, expect, test } from "vitest";
import {
  createHourPositionKey,
  createStaffingKey,
  createStaffingMapFromEntries,
  createStaffingMapFromFlat,
  updateStaffingEntry,
} from "./staffingMapHelpers";

describe("createStaffingKey", () => {
  test("day-hour-position形式のキーを生成する", () => {
    expect(createStaffingKey(1, 9, "ホール")).toBe("1-9-ホール");
    expect(createStaffingKey(0, 22, "キッチン")).toBe("0-22-キッチン");
  });
});

describe("createHourPositionKey", () => {
  test("hour-position形式のキーを生成する", () => {
    expect(createHourPositionKey(9, "ホール")).toBe("9-ホール");
  });
});

describe("createStaffingMapFromEntries", () => {
  test("StaffingEntry配列からマップを生成する", () => {
    const entries = [
      { hour: 9, position: "ホール", requiredCount: 3 },
      { hour: 9, position: "キッチン", requiredCount: 2 },
      { hour: 10, position: "ホール", requiredCount: 1 },
    ];

    const map = createStaffingMapFromEntries(entries);

    expect(map["9-ホール"]).toBe(3);
    expect(map["9-キッチン"]).toBe(2);
    expect(map["10-ホール"]).toBe(1);
  });

  test("空配列では空オブジェクトを返す", () => {
    expect(createStaffingMapFromEntries([])).toEqual({});
  });
});

describe("createStaffingMapFromFlat", () => {
  test("フラットレコードからday付きマップを生成する", () => {
    const records = [
      { dayOfWeek: 1, hour: 9, position: "ホール", requiredCount: 3 },
      { dayOfWeek: 1, hour: 10, position: "ホール", requiredCount: 2 },
      { dayOfWeek: 3, hour: 9, position: "キッチン", requiredCount: 1 },
    ];

    const map = createStaffingMapFromFlat(records);

    expect(map["1-9-ホール"]).toBe(3);
    expect(map["1-10-ホール"]).toBe(2);
    expect(map["3-9-キッチン"]).toBe(1);
  });
});

describe("updateStaffingEntry", () => {
  const base = [
    { hour: 9, position: "ホール", requiredCount: 2 },
    { hour: 9, position: "キッチン", requiredCount: 1 },
  ];

  test("既存エントリの値を更新する", () => {
    const result = updateStaffingEntry(base, 9, "ホール", 5);

    expect(result).toHaveLength(2);
    expect(result[0].requiredCount).toBe(5);
    expect(result[1].requiredCount).toBe(1);
  });

  test("存在しないエントリは追加する", () => {
    const result = updateStaffingEntry(base, 10, "ホール", 3);

    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ hour: 10, position: "ホール", requiredCount: 3 });
  });

  test("0未満の値は0にクランプする", () => {
    const result = updateStaffingEntry(base, 9, "ホール", -1);
    expect(result[0].requiredCount).toBe(0);
  });

  test("10を超える値は10にクランプする", () => {
    const result = updateStaffingEntry(base, 9, "ホール", 15);
    expect(result[0].requiredCount).toBe(10);
  });
});
