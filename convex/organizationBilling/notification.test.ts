import { describe, expect, it } from "vitest";
import { organizationBillingNotificationCopy } from "./notification";

describe("organizationBilling/notification", () => {
  const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");

  it("有料プラン選択済みのTrial終了通知へプラン・初回請求予定・Free変更期限を載せる", () => {
    const copy = organizationBillingNotificationCopy("trialEnding", {
      trialEndsAt,
      selectedPaidPlan: "pro",
    });

    expect(copy.paragraphs).toEqual([
      "無料体験は9/1(火) 00:00に終了します。",
      "選択済みの契約プランはProプランです。初回請求は9/1(火) 00:00を予定しています。",
      "Freeプランへ変更する場合の設定期限は9/1(火) 00:00です。期限までに事業者設定から変更してください。",
    ]);
    expect(copy.paragraphs.join("\n")).not.toContain("円");
  });

  it("未契約のTrial終了通知へFree成立条件と設定期限を載せる", () => {
    const copy = organizationBillingNotificationCopy("trialEnding", { trialEndsAt });

    expect(copy.paragraphs).toEqual([
      "無料体験は9/1(火) 00:00に終了します。有料プランはまだ契約されていません。",
      "終了後にFreeを利用するには、Freeで残す管理者と店舗を選び、利用人数を4名以下にしてください。条件を満たさない場合は契約制限中になります。",
      "Freeで残す管理者と店舗の設定期限は9/1(火) 00:00です。",
    ]);
  });

  it("Proへの変更不成立はBusiness継続を明示する", () => {
    expect(organizationBillingNotificationCopy("proDowngradeNotApplied")).toEqual({
      subject: "Proプランへの変更を適用できませんでした",
      heading: "Businessプランを継続しています",
      paragraphs: [
        "更新日時点の利用人数、予約済み利用枠、管理者、店舗のいずれかがProプランの上限を超えていたため、変更を適用しませんでした。",
        "Businessプランを継続しています。現在の利用状況は事業者設定で確認できます。",
      ],
    });
  });

  it("期間末変更の取消は現在の有料プラン継続を明示する", () => {
    expect(organizationBillingNotificationCopy("scheduledChangeCanceled")).toEqual({
      subject: "プラン変更予約を取り消しました",
      heading: "プラン変更予約を取り消しました",
      paragraphs: [
        "期間末に予定していたプラン変更を取り消しました。",
        "現在の有料プランを継続します。現在の契約状態は事業者設定で確認できます。",
      ],
    });
  });

  it("即時支払い失敗後のFree継続と契約制限継続を区別する", () => {
    expect(organizationBillingNotificationCopy("paidActivationFailedFreeContinued")).toMatchObject({
      heading: "Freeプランを継続しています",
      paragraphs: expect.arrayContaining([expect.stringContaining("有料プランを開始しませんでした")]),
    });
    expect(organizationBillingNotificationCopy("paidActivationFailedRestrictedContinued")).toMatchObject({
      heading: "契約制限中を継続しています",
      paragraphs: expect.arrayContaining([expect.stringContaining("有料プランを開始しませんでした")]),
    });
  });
});
