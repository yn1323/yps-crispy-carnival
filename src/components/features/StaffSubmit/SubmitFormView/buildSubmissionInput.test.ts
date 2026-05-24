import { describe, expect, it } from "vitest";
import { buildSubmissionInput } from "./buildSubmissionInput";

const entries = [
  { date: "2026-04-07", isWorking: true, startTime: "09:00", endTime: "18:00" },
  { date: "2026-04-08", isWorking: false, startTime: "09:00", endTime: "18:00" },
  { date: "2026-04-09", isWorking: true, startTime: "12:00", endTime: "20:00" },
];

describe("buildSubmissionInput", () => {
  it("時間指定は出勤日の時間だけを送信payloadにする", () => {
    expect(buildSubmissionInput({ kind: "time", startTime: "09:00", endTime: "22:00" }, entries)).toEqual({
      kind: "time",
      requests: [
        { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
        { date: "2026-04-09", startTime: "12:00", endTime: "20:00" },
      ],
    });
  });

  it("日付のみは出勤希望の日付だけを送信payloadにする", () => {
    expect(buildSubmissionInput({ kind: "dateOnly" }, entries)).toEqual({
      kind: "dateOnly",
      workingDates: ["2026-04-07", "2026-04-09"],
    });
  });

  it("勤務区分は同じ日の複数選択をoptionIdごとのpayloadに展開する", () => {
    expect(
      buildSubmissionInput(
        {
          kind: "shiftType",
          options: [
            { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
          ],
        },
        [
          { date: "2026-04-07", isWorking: true, startTime: "09:00", endTime: "15:00", optionIds: ["early", "late"] },
          { date: "2026-04-08", isWorking: false, startTime: "09:00", endTime: "15:00", optionIds: ["early"] },
          { date: "2026-04-09", isWorking: true, startTime: "15:00", endTime: "22:00", optionId: "late" },
        ],
      ),
    ).toEqual({
      kind: "shiftType",
      selections: [
        { date: "2026-04-07", optionId: "early" },
        { date: "2026-04-07", optionId: "late" },
        { date: "2026-04-09", optionId: "late" },
      ],
    });
  });
});
