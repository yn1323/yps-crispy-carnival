import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/src/domains/shift/date";
import {
  getStaffNotificationHistoryPresentation,
  type StaffNotificationHistoryDisplayStatus,
  type StaffNotificationHistoryItem,
} from "./script";

const baseItem: StaffNotificationHistoryItem = {
  _id: "history-1",
  requestedAt: new Date("2026-07-19T01:00:00Z").getTime(),
  channel: "email",
  displayTitle: "シフト募集のお知らせ",
  displayStatus: "queued",
};

describe("getStaffNotificationHistoryPresentation", () => {
  it.each<[StaffNotificationHistoryDisplayStatus, string, "neutral" | "info" | "success" | "warning" | "danger"]>([
    ["queued", "送信待ち", "neutral"],
    ["sent", "送信済み", "info"],
    ["delivered", "配信済み", "success"],
    ["delayed", "配信が遅れています", "warning"],
    ["failed", "送れませんでした", "danger"],
    ["cancelled", "キャンセル", "neutral"],
  ])("%sを表示用の状態へ変換する", (displayStatus, statusLabel, statusTone) => {
    expect(getStaffNotificationHistoryPresentation({ ...baseItem, displayStatus })).toMatchObject({
      statusLabel,
      statusTone,
    });
  });

  it.each([
    ["email" as const, "メール"],
    ["line" as const, "LINE"],
  ])("%sを%sとして表示する", (channel, channelLabel) => {
    expect(getStaffNotificationHistoryPresentation({ ...baseItem, channel }).channelLabel).toBe(channelLabel);
  });

  it("送信済み日時があれば受付日時より優先する", () => {
    const sentAt = new Date("2026-07-19T02:30:00Z").getTime();

    expect(getStaffNotificationHistoryPresentation({ ...baseItem, sentAt }).dateTimeLabel).toBe(
      formatDateTime(new Date(sentAt)),
    );
  });

  it("送信済み日時がなければ受付日時を表示する", () => {
    expect(getStaffNotificationHistoryPresentation(baseItem).dateTimeLabel).toBe(
      formatDateTime(new Date(baseItem.requestedAt)),
    );
  });
});
