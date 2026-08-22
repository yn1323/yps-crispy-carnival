import { describe, expect, it } from "vitest";
import { organizationBillingNotificationCopy } from "./notification";

describe("organizationBilling/notification", () => {
  const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");

  it("Pro選択済みのトライアル終了通知へ初回請求予定と継続取消後の利用停止を載せる", () => {
    const copy = organizationBillingNotificationCopy("trialEnding", {
      trialEndsAt,
      selectedPaidPlan: "pro",
    });

    expect(copy.paragraphs).toEqual([
      "トライアルは9/1(火) 00:00に終了します。",
      "選択済みの契約プランはProです。\n初回請求は9/1(火) 00:00を予定しています。",
      "継続を取り消す場合の期限は9/1(火) 00:00です。\n取り消すと、トライアル終了後は利用停止になります。",
    ]);
    expect(copy.paragraphs.join("\n")).not.toContain("円");
  });

  it("未契約のトライアル終了通知へ利用停止とデータ保持を載せる", () => {
    const copy = organizationBillingNotificationCopy("trialEnding", { trialEndsAt });

    expect(copy.paragraphs).toEqual([
      "トライアルは9/1(火) 00:00に終了します。\n有料プランはまだ契約されていません。",
      "有料プランを契約しない場合、トライアル終了後は利用停止になります。\n店舗・ユーザー・過去のシフトは削除されません。",
      "利用を再開するには、組織設定からProまたはBusinessを契約してください。",
    ]);
  });

  it("新しい期間末解約はFree変更ではなく解約として通知する", () => {
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
        "解約後は契約制限中になります。\n店舗・ユーザー・過去のシフトは削除されません。\n再開するには有料プランを契約してください。",
      ],
    });
  });

  it("旧Pro変更不成立eventもPro継続として表示する", () => {
    expect(organizationBillingNotificationCopy("proDowngradeNotApplied")).toEqual({
      subject: "Proへの変更を適用できませんでした",
      heading: "Proを継続しています",
      paragraphs: [
        "予約されていたプラン変更を適用できませんでした。",
        "Proを継続しています。\n現在の利用状況は組織設定で確認できます。",
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

  it.each(["trialEndedWithoutSubscription", "scheduledCancellation"] as const)(
    "%sの契約制限通知はFree整理ではなくデータ保持と再契約を案内する",
    (restrictionReason) => {
      expect(organizationBillingNotificationCopy("restrictedStarted", undefined, { restrictionReason })).toEqual({
        subject: "利用停止中になりました",
        heading: "利用停止中になりました",
        paragraphs: [
          "店舗・ユーザー・過去のシフトは削除されていませんが、シフト作成や通知などの業務操作は利用できません。",
          "利用を再開するには、組織設定からProまたはBusinessを契約してください。",
        ],
      });
    },
  );

  it("deployment前のFree条件未達通知だけはFree整理を案内する", () => {
    expect(
      organizationBillingNotificationCopy("restrictedStarted", undefined, {
        restrictionReason: "freeConditionsNotMet",
      }).paragraphs[1],
    ).toContain("無料プランで残す管理者と店舗を整理");
  });

  it("期間末変更通知へ変更先プランと適用日時を載せる", () => {
    const copy = organizationBillingNotificationCopy("scheduledChange", undefined, {
      targetPlan: "pro",
      effectiveAt: trialEndsAt,
    });

    expect(copy.subject).toBe("Proへの変更を予約しました");
    expect(copy.paragraphs[0]).toBe("9/1(火) 00:00にProへ変更します。\nそれまでは現在の有料プランを利用できます。");
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
    expect(copy.paragraphs[0]).toContain("Businessを開始しました。\n今回の請求額");
    expect(copy.paragraphs[0]).toContain("です。\n適用日時は");
  });

  it("契約復旧通知へ復旧プラン・請求額・適用日時を載せ、detailsなしの既存文面も維持する", () => {
    const detailed = organizationBillingNotificationCopy("recovered", undefined, {
      targetPlan: "business",
      amountDue: 2_980,
      currency: "jpy",
      effectiveAt: trialEndsAt,
    });
    const paragraphs = detailed.paragraphs.join("\n");

    expect(paragraphs).toContain("Businessの契約を復旧しました");
    expect(paragraphs).toContain("JPY");
    expect(paragraphs).toContain("2,980");
    expect(paragraphs).toContain("9/1(火) 00:00");
    expect(detailed.paragraphs[0]).toContain(
      "Businessの契約を復旧しました。\n確認済みの管理者と店舗で業務を再開しました。\n今回の請求額",
    );
    expect(detailed.paragraphs[0]).toContain("です。\n適用日時は");
    expect(organizationBillingNotificationCopy("recovered").paragraphs[0]).toBe(
      "支払い結果を確認し、確認済みの管理者と店舗で業務を再開しました。",
    );
  });

  it("即時支払い失敗後の無料継続と契約制限継続を区別する", () => {
    expect(organizationBillingNotificationCopy("paidActivationFailedFreeContinued")).toMatchObject({
      heading: "無料を継続しています",
      paragraphs: expect.arrayContaining([expect.stringContaining("有料プランを開始できませんでした")]),
    });
    expect(organizationBillingNotificationCopy("paidActivationFailedRestrictedContinued")).toMatchObject({
      heading: "契約制限中を継続しています",
      paragraphs: expect.arrayContaining([expect.stringContaining("有料プランを開始できませんでした")]),
    });
  });
});
