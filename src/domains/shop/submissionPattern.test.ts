import { describe, expect, it } from "vitest";
import {
  appendShiftTypeOption,
  createDefaultShiftTypeOptions,
  getAvailableEndTimeOptions,
  getAvailableStartTimeOptions,
  normalizeShiftTypeOptions,
  removeShiftTypeOptionAt,
  selectSubmissionPattern,
  updateShiftTypeOptionAt,
} from "./submissionPattern";

const SHIFT_TYPES = [
  { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 4 },
  { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 8 },
];

describe("希望シフト提出方法", () => {
  it("提出方法を切り替えると既存設定を保つか初期値を補う", () => {
    const currentTime = { kind: "time", startTime: "10:00", endTime: "20:00" } as const;
    const currentShiftType = { kind: "shiftType", options: SHIFT_TYPES } as const;

    expect(selectSubmissionPattern("time", currentTime)).toBe(currentTime);
    expect(selectSubmissionPattern("shiftType", currentShiftType)).toEqual(currentShiftType);
    expect(selectSubmissionPattern("dateOnly", currentTime)).toEqual({ kind: "dateOnly" });
    expect(selectSubmissionPattern("time", { kind: "dateOnly" })).toEqual({
      kind: "time",
      startTime: "09:00",
      endTime: "22:00",
    });
    expect(selectSubmissionPattern("shiftType", { kind: "dateOnly" })).toEqual({
      kind: "shiftType",
      options: createDefaultShiftTypeOptions(),
    });
  });

  it("勤務区分の更新・追加・削除後に表示順を振り直す", () => {
    expect(updateShiftTypeOptionAt(SHIFT_TYPES, 1, { name: "夜番" })).toEqual([
      { ...SHIFT_TYPES[0], sortOrder: 0 },
      { ...SHIFT_TYPES[1], name: "夜番", sortOrder: 1 },
    ]);

    expect(appendShiftTypeOption(SHIFT_TYPES, 1234)).toEqual([
      { ...SHIFT_TYPES[0], sortOrder: 0 },
      { ...SHIFT_TYPES[1], sortOrder: 1 },
      {
        id: "shift-type-1234-2",
        name: "",
        startTime: "09:00",
        endTime: "18:00",
        sortOrder: 2,
      },
    ]);

    expect(removeShiftTypeOptionAt(SHIFT_TYPES, 0)).toEqual([{ ...SHIFT_TYPES[1], sortOrder: 0 }]);
    expect(normalizeShiftTypeOptions(SHIFT_TYPES).map((option) => option.sortOrder)).toEqual([0, 1]);
  });

  it("終了時刻より前の開始候補と開始時刻より後の終了候補だけを返す", () => {
    expect(getAvailableStartTimeOptions("01:00").map((option) => option.value)).toEqual(["00:00", "00:30"]);
    expect(getAvailableEndTimeOptions("35:00").map((option) => option.value)).toEqual(["35:30", "36:00"]);
  });
});
