import { describe, expect, it } from "vitest";
import { organizationBillingEmailChangedNotificationCopy } from "./notification";

describe("organizationBilling/notification", () => {
  it("請求先メールアドレス変更のsecurity通知文面を返す", () => {
    expect(organizationBillingEmailChangedNotificationCopy).toEqual({
      subject: "請求通知先メールアドレスを変更しました",
      heading: "請求通知先メールアドレスを変更しました",
      paragraphs: ["請求書通知先メールアドレスが変更されました。"],
    });
  });
});
