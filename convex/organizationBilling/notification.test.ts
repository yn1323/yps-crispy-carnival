import { describe, expect, it } from "vitest";
import { organizationBillingEmailChangedNotificationCopy } from "./notification";

describe("organizationBilling/notification", () => {
  it("請求先メールアドレス変更のsecurity通知文面を返す", () => {
    expect(organizationBillingEmailChangedNotificationCopy).toEqual({
      subject: "請求先メールアドレスを変更しました",
      heading: "請求先メールアドレスを変更しました",
      paragraphs: [
        "組織の請求先メールアドレスが変更されました。\n請求先は通知先であり、契約操作の権限には影響しません。",
      ],
    });
  });
});
