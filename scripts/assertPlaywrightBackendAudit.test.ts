import { describe, expect, it } from "vitest";
import { assertPlaywrightBackendAudit, type PlaywrightBackendAudit } from "./assertPlaywrightBackendAudit";

const validAudit = {
  requestedManagerEmailCount: 6,
  matchedManagerEmailCount: 6,
  missingManagerEmailCount: 0,
  managerEmailWithoutShopCount: 0,
  auditedShopCount: 8,
  auditedOrganizationCount: 5,
  unexpectedUnresolvedFailureInboxCount: 0,
  duplicateActiveDedupeKeyCount: 0,
  notificationContexts: [],
} satisfies PlaywrightBackendAudit;

describe("Full Regression backend audit gate", () => {
  it("6ユーザーを対象に通知安全条件が揃っていれば成功する", () => {
    expect(assertPlaywrightBackendAudit(validAudit)).toEqual(validAudit);
  });

  it("削除シナリオ後にmanagerまたは店舗所属が欠けていても成功する", () => {
    const audit = {
      ...validAudit,
      matchedManagerEmailCount: 4,
      missingManagerEmailCount: 2,
      managerEmailWithoutShopCount: 3,
      auditedShopCount: 2,
      auditedOrganizationCount: 1,
    };

    expect(assertPlaywrightBackendAudit(audit)).toEqual(audit);
  });

  it.each([
    ["managerが5件", { requestedManagerEmailCount: 5, matchedManagerEmailCount: 5 }, "requestedManagerEmailCount"],
    ["managerが7件", { requestedManagerEmailCount: 7, matchedManagerEmailCount: 7 }, "requestedManagerEmailCount"],
    ["監査対象店舗がない", { auditedShopCount: 0 }, "auditedShopCount"],
    ["監査対象組織がない", { auditedOrganizationCount: 0 }, "auditedOrganizationCount"],
    [
      "未解決のFailure Inboxがある",
      { unexpectedUnresolvedFailureInboxCount: 1, notificationContexts: ["shift_submission"] },
      "unexpectedUnresolvedFailureInboxCount",
    ],
    ["activeなdedupe keyが重複している", { duplicateActiveDedupeKeyCount: 1 }, "duplicateActiveDedupeKeyCount"],
  ])("%s場合は失敗する", (_label, override, expectedField) => {
    expect(() => assertPlaywrightBackendAudit({ ...validAudit, ...override })).toThrow(expectedField);
  });

  it.each([
    [
      "matchedとmissingの合計がrequestedと異なる",
      { matchedManagerEmailCount: 4, missingManagerEmailCount: 1 },
      "matchedManagerEmailCount plus missingManagerEmailCount",
    ],
    [
      "店舗なしmanagerがmatchedを超える",
      { matchedManagerEmailCount: 4, missingManagerEmailCount: 2, managerEmailWithoutShopCount: 5 },
      "managerEmailWithoutShopCount",
    ],
    [
      "未解決Failureがないのにcontextがある",
      { notificationContexts: ["shift_submission"] },
      "notificationContexts must correspond",
    ],
    [
      "未解決Failureに対応するcontextがない",
      { unexpectedUnresolvedFailureInboxCount: 1 },
      "notificationContexts must correspond",
    ],
    [
      "context数が未解決Failure数を超える",
      { unexpectedUnresolvedFailureInboxCount: 1, notificationContexts: ["confirmation", "shift_submission"] },
      "notificationContexts must correspond",
    ],
    [
      "contextが重複している",
      { unexpectedUnresolvedFailureInboxCount: 2, notificationContexts: ["shift_submission", "shift_submission"] },
      "notificationContexts must contain unique values",
    ],
    [
      "contextがsortされていない",
      { unexpectedUnresolvedFailureInboxCount: 2, notificationContexts: ["shift_submission", "confirmation"] },
      "notificationContexts must contain unique values",
    ],
  ])("DTO内部で%s場合は失敗する", (_label, override, expectedMessage) => {
    expect(() => assertPlaywrightBackendAudit({ ...validAudit, ...override })).toThrow(expectedMessage);
  });

  it.each([
    ["必須countが欠けている", { ...validAudit, auditedShopCount: undefined }, "auditedShopCount"],
    ["countが負数", { ...validAudit, missingManagerEmailCount: -1 }, "missingManagerEmailCount"],
    ["countが小数", { ...validAudit, duplicateActiveDedupeKeyCount: 0.5 }, "duplicateActiveDedupeKeyCount"],
    ["通知contextが配列ではない", { ...validAudit, notificationContexts: "shift_submission" }, "notificationContexts"],
  ])("DTOの%s場合はfail closedする", (_label, audit, expectedField) => {
    expect(() => assertPlaywrightBackendAudit(audit)).toThrow(expectedField);
  });
});
