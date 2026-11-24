import { describe, expect, it } from "vitest";
import { organizationBillingEmailChangedNotificationCopy } from "./notification";

describe("organizationBilling/notification", () => {
  it("支払いのお知らせ先変更のsecurity通知文面を返す", () => {
    expect(organizationBillingEmailChangedNotificationCopy).toEqual({
      subject: "支払いのお知らせ先を変更しました",
      heading: "支払いのお知らせ先を変更しました",
      paragraphs: ["支払いのお知らせ先のメールアドレスが変更されました。"],
    });
  });
});
