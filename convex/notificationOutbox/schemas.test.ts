import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_OUTBOX_ACTIVE_STATUSES,
  NOTIFICATION_OUTBOX_STATUSES,
  NOTIFICATION_OUTBOX_TERMINAL_STATUSES,
} from "./schemas";

describe("notification outbox lifecycle statuses", () => {
  it("配送対象とterminal状態を重複なく分類する", () => {
    expect(NOTIFICATION_OUTBOX_ACTIVE_STATUSES).toEqual(["pending", "processing"]);
    expect(NOTIFICATION_OUTBOX_TERMINAL_STATUSES).toEqual(["sent", "failed", "cancelled"]);
    expect(NOTIFICATION_OUTBOX_STATUSES).toEqual(["pending", "processing", "sent", "failed", "cancelled"]);
    expect(new Set(NOTIFICATION_OUTBOX_STATUSES).size).toBe(NOTIFICATION_OUTBOX_STATUSES.length);
  });
});
