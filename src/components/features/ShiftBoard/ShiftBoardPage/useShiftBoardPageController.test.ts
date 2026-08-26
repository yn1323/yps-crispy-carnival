import { describe, expect, it } from "vitest";
import { getShiftBoardReadOnlyReason, resolveReminderStatus } from "./useShiftBoardPageController";

describe("getShiftBoardReadOnlyReason", () => {
  it("上限超過は確定した超過として案内する", () => {
    expect(getShiftBoardReadOnlyReason("usageLimitExceeded")).toContain("プラン上限を超えているため");
  });

  it("利用数未確定を上限超過と断定しない", () => {
    const reason = getShiftBoardReadOnlyReason("usageLimitEvaluationUnavailable");

    expect(reason).toContain("利用数を安全に確認できないため");
    expect(reason).not.toContain("上限を超えて");
  });
});

describe("resolveReminderStatus", () => {
  it("送信記録があれば予定より優先して送信日時を表示する", () => {
    const status = resolveReminderStatus({
      lastReminderSentAt: new Date("2026-08-26T05:30:00Z").getTime(),
      reminderScheduledAt: new Date("2026-08-27T08:00:00Z").getTime(),
      isReminderScheduleActive: true,
    });

    expect(status).toMatchObject({
      kind: "sent",
      label: expect.stringMatching(/に催促通知を送りました$/),
    });
  });

  it("未送信で予定時刻前なら自動催促の予定を表示する", () => {
    expect(
      resolveReminderStatus({
        lastReminderSentAt: null,
        reminderScheduledAt: new Date("2026-08-27T08:00:00Z").getTime(),
        isReminderScheduleActive: true,
      }),
    ).toEqual({
      kind: "scheduled",
      label: "提出期限の前日17:00に催促通知を自動で送ります",
    });
  });

  it("送信記録も予定もなければ予定なしと表示する", () => {
    expect(
      resolveReminderStatus({
        lastReminderSentAt: null,
        reminderScheduledAt: null,
        isReminderScheduleActive: false,
      }),
    ).toEqual({
      kind: "none",
      label: "自動催促の予定はありません",
    });
  });

  it("予定時刻を過ぎても送信記録がなければ催促状態を断定しない", () => {
    expect(
      resolveReminderStatus({
        lastReminderSentAt: null,
        reminderScheduledAt: new Date("2026-08-25T08:00:00Z").getTime(),
        isReminderScheduleActive: false,
      }),
    ).toEqual({ kind: "unconfirmed" });
  });
});
