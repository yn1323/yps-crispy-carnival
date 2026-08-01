import { describe, expect, it } from "vitest";
import {
  buildNotificationDebugPlan,
  getDeploymentReferenceFromEnvFile,
  isDevDeploymentReference,
} from "./runNotificationDebug";

describe("runNotificationDebug", () => {
  it("cronモードは17時の日次通知2本だけを全店舗対象で実行する", () => {
    expect(buildNotificationDebugPlan("cron")).toEqual([
      { functionName: "staffRegistration/actions:sendOwnerDailyDigest", args: {} },
      { functionName: "notificationOutbox/failureReminderActions:sendFailureReminderDigest", args: {} },
    ]);
  });

  it("recruitmentモードは募集IDを登録催促と確定催促へ渡す", () => {
    expect(buildNotificationDebugPlan("recruitment", "recruitment_test")).toEqual([
      { functionName: "notification/reminderActions:sendReminderEmails", args: { recruitmentId: "recruitment_test" } },
      {
        functionName: "shiftConfirmationReminder/actions:sendManagerConfirmationReminder",
        args: { recruitmentId: "recruitment_test" },
      },
    ]);
  });

  it("shopモードは店舗IDを承認待ち・不達・登録7日後通知へ渡す", () => {
    expect(buildNotificationDebugPlan("shop", "shop_test")).toEqual([
      { functionName: "staffRegistration/actions:sendOwnerDailyDigest", args: { shopId: "shop_test" } },
      {
        functionName: "notificationOutbox/failureReminderActions:sendFailureReminderDigest",
        args: { shopId: "shop_test" },
      },
      { functionName: "shopActivationReminder/actions:sendReminder", args: { shopId: "shop_test" } },
    ]);
  });

  it("cron以外は対象IDを必須にする", () => {
    expect(() => buildNotificationDebugPlan("recruitment")).toThrow("対象IDが必要");
    expect(() => buildNotificationDebugPlan("shop")).toThrow("対象IDが必要");
    expect(() => buildNotificationDebugPlan("cron", "shop_test")).toThrow("IDを指定しない");
  });

  it("env fileからdeploymentを読み取り、dev/localだけを許可する", () => {
    expect(getDeploymentReferenceFromEnvFile("CONVEX_DEPLOYMENT=dev:example # comment\n")).toBe("dev:example");
    expect(getDeploymentReferenceFromEnvFile("CONVEX_DEPLOYMENT=local\n")).toBe("local");
    expect(isDevDeploymentReference("dev:example")).toBe(true);
    expect(isDevDeploymentReference("local")).toBe(true);
    expect(isDevDeploymentReference("prod")).toBe(false);
  });
});
