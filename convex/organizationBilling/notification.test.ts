import { describe, expect, it } from "vitest";
import { organizationBillingNotificationCopy } from "./notification";

describe("organizationBilling/notification", () => {
  const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");

  it("Pro選択済みのトライアル終了通知へ初回請求予定と無料変更期限を載せる", () => {
    const copy = organizationBillingNotificationCopy("trialEnding", {
      trialEndsAt,
      selectedPaidPlan: "pro",
    });

    expect(copy.paragraphs).toEqual([
      "トライアルは9/1(火) 00:00に終了します。",
      "選択済みの契約プランはProです。初回請求は9/1(火) 00:00を予定しています。",
      "無料へ変更する場合の設定期限は9/1(火) 00:00です。期限までにグループ設定から変更してください。",
    ]);
    expect(copy.paragraphs.join("\n")).not.toContain("円");
  });

  it("未契約のトライアル終了通知へ無料の成立条件と設定期限を載せる", () => {
    const copy = organizationBillingNotificationCopy("trialEnding", { trialEndsAt });

    expect(copy.paragraphs).toEqual([
      "トライアルは9/1(火) 00:00に終了します。有料プランはまだ契約されていません。",
      "終了後に無料を利用するには、無料で残す管理者と店舗を選び、利用人数を5名以下にしてください。条件を満たさない場合は契約制限中になります。",
      "無料で残す管理者と店舗の設定期限は9/1(火) 00:00です。",
    ]);
  });

  it("旧Pro変更不成立eventもPro継続として表示する", () => {
    expect(organizationBillingNotificationCopy("proDowngradeNotApplied")).toEqual({
      subject: "Proへの変更を適用できませんでした",
      heading: "Proを継続しています",
      paragraphs: [
        "予約されていたプラン変更を適用できませんでした。",
        "Proを継続しています。現在の利用状況はグループ設定で確認できます。",
      ],
    });
  });

  it("期間末変更の取消は現在の有料プラン継続を明示する", () => {
    expect(organizationBillingNotificationCopy("scheduledChangeCanceled")).toEqual({
      subject: "プラン変更予約を取り消しました",
      heading: "プラン変更予約を取り消しました",
      paragraphs: [
        "期間末に予定していたプラン変更を取り消しました。",
        "現在の有料プランを継続します。現在の契約状態はグループ設定で確認できます。",
      ],
    });
  });

  it("期間末変更通知へ変更先プランと適用日時を載せる", () => {
    const copy = organizationBillingNotificationCopy("scheduledChange", undefined, {
      targetPlan: "pro",
      effectiveAt: trialEndsAt,
    });

    expect(copy.subject).toBe("Proへの変更を予約しました");
    expect(copy.paragraphs.join("\n")).toContain("9/1(火) 00:00にProへ変更します");
  });

  it("日割り変更完了通知へ変更先プラン・請求額・適用日時を載せる", () => {
    const copy = organizationBillingNotificationCopy("planActivated", undefined, {
      targetPlan: "business",
      amountDue: 1_200,
      currency: "jpy",
      effectiveAt: trialEndsAt,
    });
    const paragraphs = copy.paragraphs.join("\n");

    expect(copy.subject).toBe("Businessを開始しました");
    expect(paragraphs).toContain("JPY");
    expect(paragraphs).toContain("1,200");
    expect(paragraphs).toContain("9/1(火) 00:00");
  });

  it("即時支払い失敗後の無料継続と契約制限継続を区別する", () => {
    expect(organizationBillingNotificationCopy("paidActivationFailedFreeContinued")).toMatchObject({
      heading: "無料を継続しています",
      paragraphs: expect.arrayContaining([expect.stringContaining("有料プランを開始しませんでした")]),
    });
    expect(organizationBillingNotificationCopy("paidActivationFailedRestrictedContinued")).toMatchObject({
      heading: "契約制限中を継続しています",
      paragraphs: expect.arrayContaining([expect.stringContaining("有料プランを開始しませんでした")]),
    });
  });
});
