import { describe, expect, it } from "vitest";
import { organizationBillingNotificationCopy } from "./notification";

describe("organizationBilling/notification", () => {
  const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");

  it("Standard選択済みのトライアル終了通知へ初回請求予定と取消後のFree移行を載せる", () => {
    const copy = organizationBillingNotificationCopy("trialEnding", {
      trialEndsAt,
      selectedPaidPlan: "standard",
    });

    expect(copy.paragraphs).toEqual([
      "トライアルは9/1(火) 00:00に終了します。",
      "選択済みの契約プランはStandardです。\n初回請求は9/1(火) 00:00を予定しています。",
      "継続を取り消す場合の期限は9/1(火) 00:00です。\n取り消すと、トライアル終了後は無料プランへ変更されます。",
      "無料プランの利用上限を超えている場合は、上限内へ整理するまで業務操作が制限されます。",
    ]);
    expect(copy.paragraphs.join("\n")).not.toContain("円");
  });

  it("未契約のトライアル終了通知へFree移行とデータ保持を載せる", () => {
    const copy = organizationBillingNotificationCopy("trialEnding", { trialEndsAt });

    expect(copy.paragraphs).toEqual([
      "トライアルは9/1(火) 00:00に終了します。\n有料プランはまだ契約されていません。",
      "有料プランを契約しない場合、トライアル終了後は無料プランへ変更されます。\n店舗・ユーザー・過去のシフトは削除されません。",
      "無料プランの利用上限を超えている場合は、上限内へ整理するまで業務操作が制限されます。\nStandardまたはProへ変更することもできます。",
    ]);
  });

  it("初回請求結果待ちはトライアルとは切り離してStandard相当の継続を案内する", () => {
    expect(organizationBillingNotificationCopy("initialPaymentPending")).toEqual({
      subject: "初回請求の結果を確認しています",
      heading: "初回請求の結果を確認しています",
      paragraphs: [
        "支払い結果を確認しています。\n確認中も、Standard相当の機能を利用できます。",
        "支払い結果が確定すると、組織設定に反映されます。",
      ],
    });
  });

  it("新しい期間末解約は解約後のFree移行として通知する", () => {
    expect(
      organizationBillingNotificationCopy("scheduledChange", undefined, {
        targetPlan: "free",
        effectiveAt: trialEndsAt,
        restrictAtPeriodEnd: true,
      }),
    ).toEqual({
      subject: "解約を受け付けました",
      heading: "解約を受け付けました",
      paragraphs: [
        "9/1(火) 00:00をもって解約します。\nそれまでは現在の有料プランを利用できます。",
        "解約後は無料プランへ変更されます。\n店舗・ユーザー・過去のシフトは削除されません。",
        "無料プランの利用上限を超えている場合は、上限内へ整理するまで業務操作が制限されます。",
      ],
    });
  });

  it("旧Pro変更不成立eventもStandard継続として表示する", () => {
    expect(organizationBillingNotificationCopy("proDowngradeNotApplied")).toEqual({
      subject: "Standardへの変更を適用できませんでした",
      heading: "Standardを継続しています",
      paragraphs: [
        "予約されていたプラン変更を適用できませんでした。",
        "Standardを継続しています。\n現在の利用状況は組織設定で確認できます。",
      ],
    });
  });

  it("期間末変更または解約の取消は現在の有料プラン継続を明示する", () => {
    expect(organizationBillingNotificationCopy("scheduledChangeCanceled")).toEqual({
      subject: "プラン変更予約を取り消しました",
      heading: "プラン変更予約を取り消しました",
      paragraphs: [
        "期間末に予定していたプラン変更を取り消しました。",
        "現在の有料プランを継続します。\n現在の契約状態は組織設定で確認できます。",
      ],
    });
    expect(
      organizationBillingNotificationCopy("scheduledChangeCanceled", undefined, { restrictAtPeriodEnd: true }),
    ).toEqual({
      subject: "解約予約を取り消しました",
      heading: "解約予約を取り消しました",
      paragraphs: [
        "期間末に予定していた解約を取り消しました。",
        "現在の有料プランを継続します。\n現在の契約状態は組織設定で確認できます。",
      ],
    });
  });

  it("期間末変更通知へ変更先プランと適用日時を載せる", () => {
    const copy = organizationBillingNotificationCopy("scheduledChange", undefined, {
      targetPlan: "standard",
      effectiveAt: trialEndsAt,
    });

    expect(copy.subject).toBe("Standardへの変更を予約しました");
    expect(copy.paragraphs[0]).toBe(
      "9/1(火) 00:00にStandardへ変更します。\nそれまでは現在の有料プランを利用できます。",
    );
    expect(copy.paragraphs.join("\n")).toContain("9/1(火) 00:00にStandardへ変更します");
  });

  it("日割り変更完了通知へ変更先プラン・請求額・適用日時を載せる", () => {
    const copy = organizationBillingNotificationCopy("planActivated", undefined, {
      targetPlan: "pro",
      amountDue: 1_200,
      currency: "jpy",
      effectiveAt: trialEndsAt,
    });
    const paragraphs = copy.paragraphs.join("\n");

    expect(copy.subject).toBe("Proを開始しました");
    expect(paragraphs).toContain("JPY");
    expect(paragraphs).toContain("1,200");
    expect(paragraphs).toContain("9/1(火) 00:00");
    expect(copy.paragraphs[0]).toContain("Proを開始しました。\n今回の請求額");
    expect(copy.paragraphs[0]).toContain("です。\n適用日時は");
  });

  it("下位プラン適用後の上限超過は契約成立と自動解除条件を案内する", () => {
    const copy = organizationBillingNotificationCopy("planActivated", undefined, {
      targetPlan: "standard",
      usageLimitExceeded: true,
    });

    expect(copy.heading).toBe("Standardを開始しました");
    expect(copy.paragraphs.join("\n")).toContain("Standardプランの利用上限を超えている");
    expect(copy.paragraphs.join("\n")).toContain("上限内になると、業務操作は自動的に再開");
  });

  it("契約復旧通知へ復旧プラン・請求額・適用日時を載せ、detailsなしの既存文面も維持する", () => {
    const detailed = organizationBillingNotificationCopy("recovered", undefined, {
      targetPlan: "pro",
      amountDue: 2_980,
      currency: "jpy",
      effectiveAt: trialEndsAt,
    });
    const paragraphs = detailed.paragraphs.join("\n");

    expect(paragraphs).toContain("Proの契約を復旧しました");
    expect(paragraphs).toContain("JPY");
    expect(paragraphs).toContain("2,980");
    expect(paragraphs).toContain("9/1(火) 00:00");
    expect(detailed.paragraphs[0]).toContain("Proの契約を復旧しました。\n今回の請求額");
    expect(detailed.paragraphs[0]).toContain("です。\n適用日時は");
    expect(organizationBillingNotificationCopy("recovered").paragraphs[0]).toBe(
      "支払い結果を確認し、業務を再開しました。",
    );
  });

  it("即時支払い失敗後のFree継続を案内する", () => {
    expect(organizationBillingNotificationCopy("paidActivationFailedFreeContinued")).toMatchObject({
      heading: "Freeを継続しています",
      paragraphs: expect.arrayContaining([expect.stringContaining("有料プランを開始できませんでした")]),
    });
  });
});
