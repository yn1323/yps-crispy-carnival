import { describe, expect, it } from "vitest";
import { formatResendSubject } from "../_lib/emailFormat";
import {
  buildConfirmationEmailHtml,
  buildLineDefaultReplyText,
  buildNotificationFailureReminderLineFlexMessage,
  buildNotificationFailureReminderLineText,
  buildRecruitmentLineFlexMessage,
  buildRecruitmentLineText,
  buildReissueLineFlexMessage,
  buildReminderLineFlexMessage,
  buildReminderLineText,
  buildShiftConfirmationLineFlexMessage,
  buildShiftConfirmationLineText,
  buildShiftConfirmationReminderLineFlexMessage,
  buildShiftConfirmationReminderLineText,
  buildShopActivationReminderEmailHtml,
  buildShopActivationReminderLineFlexMessage,
  buildShopActivationReminderLineText,
  buildStaffLegalConsentLineFlexMessage,
  buildStaffRegistrationOwnerDigestEmailHtml,
  buildStaffRegistrationOwnerDigestLineFlexMessage,
  buildStaffRegistrationOwnerDigestLineText,
  type NotificationLineFlexMessage,
  SHOP_ACTIVATION_REMINDER_SUBJECT,
  STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT,
} from "./templates";

describe("notification/templates", () => {
  it("確定通知メールとLINEに日ごと・勤務区分ラベルを表示する", () => {
    const shifts = [
      { date: "1/20(火)", timeLabel: "出勤" },
      { date: "1/21(水)", timeLabel: "遅番（15:00-22:00）" },
      { date: "1/22(木)", startTime: "21:00", endTime: "25:00" },
      { date: "1/23(金)", timeLabel: null },
    ];

    const lineText = buildShiftConfirmationLineText({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      periodLabel: "1/20(火)〜1/22(木)",
      shifts,
      magicLinkUrl: "https://example.com/shifts/view?token=test",
      isResend: false,
    });
    const emailHtml = buildConfirmationEmailHtml({
      staffName: "田中太郎",
      periodLabel: "1/20(火)〜1/22(木)",
      shifts,
      magicLinkUrl: "https://example.com/shifts/view?token=test",
      reissueUrl: "https://example.com/shifts/reissue?recruitmentId=test",
      isResend: false,
    });

    // 通知一覧で一瞬で種別が分かるよう、1行目に状態ラベル（絵文字 + 種別）を置く
    expect(lineText.startsWith("✅ シフト確定\n")).toBe(true);
    // LINE内ブラウザのGoogle OAuthブロック回避のため、LINE本文のURLのみ外部ブラウザで開かせる
    expect(lineText).toContain("https://example.com/shifts/view?token=test&openExternalBrowser=1");
    expect(emailHtml).not.toContain("openExternalBrowser");
    expect(lineText).toContain("1/20(火) 出勤");
    expect(lineText).toContain("1/21(水) 遅番（15:00-22:00）");
    expect(lineText).toContain("1/22(木) 21:00-翌1:00");
    expect(lineText).toContain("1/23(金) 休み");
    expect(emailHtml).toContain("出勤");
    expect(emailHtml).toContain("遅番（15:00-22:00）");
    expect(emailHtml).toContain("21:00-翌1:00");
    expect(emailHtml).toContain("休み");
  });

  it("確定通知Flexはfallback textをaltTextにし、勤務行とCTA URLを保持する", () => {
    const flex = buildShiftConfirmationLineFlexMessage({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      periodLabel: "1/20(火)〜1/22(木)",
      shifts: [
        { date: "1/20(火)", timeLabel: "出勤" },
        { date: "1/21(水)", timeLabel: null },
      ],
      magicLinkUrl: "https://example.com/shifts/view?token=test",
      isResend: false,
    });

    expect(flex.type).toBe("flex");
    expect(flex.altText).toContain("✅ シフト確定");
    expect(flex.altText).toContain("https://example.com/shifts/view?token=test&openExternalBrowser=1");
    expect(flexTexts(flex)).toEqual(
      expect.arrayContaining(["テスト店舗\n✅ シフト確定", "▼あなたのシフト", "1/20(火)", "出勤", "1/21(水)", "休み"]),
    );
    expect(flexBodyTextsWithoutTitle(flex)).toContain("1/20(火)〜1/22(木) のシフトが確定しました。");
    expect(flexBodyTextsWithoutTitle(flex).join("\n")).not.toContain("テスト店舗");
    expect(flexBodyTextsWithoutTitle(flex).join("\n")).not.toContain("全員分の確認はこちら");
    expect(flex.altText).not.toContain("24時間有効");
    expect(flexButtonLabels(flex)).toContain("全員分の確認はこちら");
    expect(flexUris(flex)).toContain("https://example.com/shifts/view?token=test&openExternalBrowser=1");
  });

  it("Flex altTextはLINE上限の1500文字に収める", () => {
    const flex = buildRecruitmentLineFlexMessage({
      staffName: `${"長い名前".repeat(500)}😀`,
      shopName: "テスト店舗",
      periodLabel: "7/2(木)〜7/30(木)",
      deadline: "6/25(金) 23:59",
      magicLinkUrl: "https://example.com/shifts/submit?token=test",
    });

    expect(flex.altText.length).toBeLessThanOrEqual(1500);
    expect(flex.altText.endsWith("…")).toBe(true);
    expect(/[\uD800-\uDBFF]$/.test(flex.altText)).toBe(false);
  });

  it("シフト変更（再送）の確定通知は変更ラベルを1行目に置く", () => {
    const lineText = buildShiftConfirmationLineText({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      periodLabel: "1/20(火)〜1/22(木)",
      shifts: [{ date: "1/20(火)", timeLabel: "出勤" }],
      magicLinkUrl: "https://example.com/shifts/view?token=test",
      isResend: true,
    });

    expect(lineText.startsWith("🔁 シフト変更\n")).toBe(true);

    const flex = buildShiftConfirmationLineFlexMessage({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      periodLabel: "1/20(火)〜1/22(木)",
      shifts: [{ date: "1/20(火)", timeLabel: "出勤" }],
      magicLinkUrl: "https://example.com/shifts/view?token=test",
      isResend: true,
    });
    expect(flexTexts(flex)).toContain("テスト店舗\n🔁 シフト変更");
    expect(flexBodyTextsWithoutTitle(flex)).toContain("1/20(火)〜1/22(木) のシフトが変更されました。");
    expect(flexBodyTextsWithoutTitle(flex).join("\n")).not.toContain("テスト店舗");
    expect(flexBodyTextsWithoutTitle(flex).join("\n")).not.toContain("全員分の確認はこちら");
    expect(flex.altText).not.toContain("24時間有効");
    expect(flexButtonLabels(flex)).toContain("全員分の確認はこちら");
  });

  it("各LINE通知の1行目に状態ラベル（絵文字 + 種別）を置く", () => {
    const recruitment = buildRecruitmentLineText({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      periodLabel: "7/2(木)〜7/30(木)",
      deadline: "6/25(金) 23:59",
      magicLinkUrl: "https://example.com/shifts/submit?token=test",
    });
    const reminder = buildReminderLineText({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      periodLabel: "7/2(木)〜7/30(木)",
      linkExpiresAtLabel: "6/25(金) 23:59",
      magicLinkUrl: "https://example.com/shifts/submit?token=test",
    });
    const confirmationReminder = buildShiftConfirmationReminderLineText({
      periodLabel: "7/2(木)〜7/30(木)",
      deadlineLabel: "6/30(火) 23:59",
      dashboardUrl: "https://shiftori.app/dashboard",
    });
    const failure = buildNotificationFailureReminderLineText({
      dashboardUrl: "https://shiftori.app/dashboard",
    });
    const shopActivation = buildShopActivationReminderLineText({
      dashboardUrl: "https://shiftori.app/dashboard",
    });

    expect(recruitment.startsWith("📩 提出依頼\n")).toBe(true);
    expect(reminder.startsWith("🔔 提出リマインド\n")).toBe(true);
    expect(confirmationReminder.startsWith("⏰ 締切超過\n")).toBe(true);
    expect(failure.startsWith("⚠️ 通知失敗\n")).toBe(true);
    expect(shopActivation.startsWith("📅 シフト作成の続き\n")).toBe(true);
    // ⚠️ は対応必須の通知失敗のみ。他の種別には使わない
    expect(recruitment).not.toContain("⚠️");
    expect(reminder).not.toContain("⚠️");
    expect(confirmationReminder).not.toContain("⚠️");
    expect(shopActivation).not.toContain("⚠️");
  });

  it("各Flex通知はtype, altText, 主要文言, CTA URLを保持する", () => {
    const dashboardUrl = "https://shiftori.app/dashboard";
    const submitUrl = "https://example.com/shifts/submit?token=test";
    const flexMessages = [
      {
        message: buildRecruitmentLineFlexMessage({
          staffName: "田中太郎",
          shopName: "テスト店舗",
          periodLabel: "7/2(木)〜7/30(木)",
          deadline: "6/25(金) 23:59",
          magicLinkUrl: submitUrl,
        }),
        title: "テスト店舗\n📩 提出依頼",
        text: "提出締切: 6/25(金) 23:59",
        label: "提出はこちら",
        uri: `${submitUrl}&openExternalBrowser=1`,
      },
      {
        message: buildReminderLineFlexMessage({
          staffName: "田中太郎",
          shopName: "テスト店舗",
          periodLabel: "7/2(木)〜7/30(木)",
          linkExpiresAtLabel: "6/25(金) 23:59",
          magicLinkUrl: submitUrl,
        }),
        title: "テスト店舗\n🔔 提出リマインド",
        text: "まだ提出されていないようです。できるだけお早めに提出してください。",
        label: "提出はこちら",
        uri: `${submitUrl}&openExternalBrowser=1`,
      },
      {
        message: buildReissueLineFlexMessage({
          staffName: "田中太郎",
          shopName: "テスト店舗",
          periodLabel: "7/2(木)〜7/30(木)",
          magicLinkUrl: "https://example.com/shifts/view?token=test",
        }),
        title: "テスト店舗\n🔁 リンク再発行",
        text: "7/2(木)〜7/30(木) のシフト閲覧リンクを再発行しました。",
        label: "シフトの確認はこちら",
        uri: "https://example.com/shifts/view?token=test&openExternalBrowser=1",
      },
      {
        message: buildShiftConfirmationReminderLineFlexMessage({
          shopName: "テスト店舗",
          periodLabel: "7/2(木)〜7/30(木)",
          deadlineLabel: "6/30(火) 23:59",
          dashboardUrl,
        }),
        title: "テスト店舗\n⏰ 締切超過",
        text: "提出締切（6/30(火) 23:59）を過ぎています。",
        label: "シフトの確定はこちら",
        uri: `${dashboardUrl}?openExternalBrowser=1`,
      },
      {
        message: buildNotificationFailureReminderLineFlexMessage({ shopName: "テスト店舗", dashboardUrl }),
        title: "テスト店舗\n⚠️ 通知失敗",
        text: "通知の送信に失敗したスタッフがいます。",
        label: "ダッシュボードを確認",
        uri: `${dashboardUrl}?openExternalBrowser=1`,
      },
      {
        message: buildShopActivationReminderLineFlexMessage({ shopName: "テスト店舗", dashboardUrl }),
        title: "テスト店舗\n📅 シフト作成の続き",
        text: "スタッフを追加して実際にシフトを回収してみましょう！",
        label: "シフト募集作成はこちら",
        uri: `${dashboardUrl}?openExternalBrowser=1`,
      },
      {
        message: buildStaffRegistrationOwnerDigestLineFlexMessage({ shopName: "テスト店舗", dashboardUrl }),
        title: "テスト店舗\n📝 承認依頼",
        text: "スタッフの承認依頼が届いています。",
        label: "ダッシュボードを確認",
        uri: `${dashboardUrl}?openExternalBrowser=1`,
      },
      {
        message: buildStaffLegalConsentLineFlexMessage({
          staffName: "田中太郎",
          shopName: "テスト店舗",
          consentUrl: "https://shiftori.app/legal/staff/consent?token=test",
          expiresAt: new Date("2026-05-31T12:00:00+09:00").getTime(),
        }),
        title: "テスト店舗\n📄 ご案内",
        text: "シフトリの使い方と、利用規約・プライバシーポリシーを確認できます。",
        label: "確認はこちら",
        uri: "https://shiftori.app/legal/staff/consent?token=test&openExternalBrowser=1",
      },
    ];

    for (const { message, title, text, label, uri } of flexMessages) {
      expect(message.type).toBe("flex");
      expect(message.altText.length).toBeGreaterThan(0);
      expect(flexTexts(message)).toContain(title);
      expect(flexTexts(message)).toContain(text);
      expect(flexBodyTextsWithoutTitle(message).join("\n")).not.toContain("テスト店舗");
      expect(flexButtonLabels(message)).toContain(label);
      expect(flexUris(message)).toContain(uri);
    }
  });

  it("スタッフ参加申請のオーナー通知はダッシュボードリンクのみを案内し、申請者情報を含めない", () => {
    const dashboardUrl = "https://shiftori.app/dashboard";
    const lineText = buildStaffRegistrationOwnerDigestLineText({ dashboardUrl });
    const emailHtml = buildStaffRegistrationOwnerDigestEmailHtml({
      managerName: "店長",
      dashboardUrl,
    });

    expect(formatResendSubject("テスト店舗", STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT)).toBe(
      "【シフトリ：テスト店舗】スタッフの承認依頼が届いています",
    );
    expect(lineText.startsWith("📝 承認依頼\n")).toBe(true);
    expect(lineText).toContain("スタッフの承認依頼が届いています。");
    expect(lineText).toContain("シフトリのダッシュボードで確認してください。");
    expect(lineText).toContain(`${dashboardUrl}?openExternalBrowser=1`);
    expect(emailHtml).toContain("スタッフの承認依頼が届いています。");
    expect(emailHtml).toContain("シフトリのダッシュボードで確認してください。");
    expect(emailHtml).toContain("ダッシュボードを確認する");
    expect(emailHtml).toContain(dashboardUrl);
    expect(`${lineText}\n${emailHtml}`).not.toContain("申請スタッフ");
    expect(`${lineText}\n${emailHtml}`).not.toContain("request@example.com");
  });

  it("店舗登録後の本番募集リマインダーはスタッフ追加と募集作成CTAを表示する", () => {
    const dashboardUrl = "https://shiftori.app/dashboard";
    const lineText = buildShopActivationReminderLineText({ dashboardUrl });
    const emailHtml = buildShopActivationReminderEmailHtml({
      managerName: "佐藤 店長",
      dashboardUrl,
    });

    expect(formatResendSubject("テスト店舗", SHOP_ACTIVATION_REMINDER_SUBJECT)).toBe(
      "【シフトリ：テスト店舗】本番のシフト募集を作れます",
    );
    expect(lineText).toBe(
      [
        "📅 シフト作成の続き",
        "",
        "シフトリで店舗登録が完了してから1週間経過しました。",
        "",
        "スタッフを追加して実際にシフトを回収してみましょう！",
        "",
        "シフト募集作成はこちら↓↓",
        `${dashboardUrl}?openExternalBrowser=1`,
      ].join("\n"),
    );
    expect(emailHtml).toContain("佐藤 店長さん");
    expect(emailHtml).toContain("📅 シフト作成の続き");
    expect(emailHtml).toContain("シフトリで店舗登録が完了してから1週間経過しました。");
    expect(emailHtml).toContain("スタッフを追加して実際にシフトを回収してみましょう！");
    expect(emailHtml).toContain("シフト募集作成はこちら↓↓");
    expect(emailHtml).toContain(dashboardUrl);
    expect(emailHtml).not.toContain("openExternalBrowser=1");
  });

  it("LINEの通常返信文はテンプレートから生成する", () => {
    const text = buildLineDefaultReplyText();

    expect(text).toContain("シフトリの通知用アカウントです。");
    expect(text).toContain("メール／LINEのリンクからお願いします。");
  });
});

function flexTexts(message: NotificationLineFlexMessage): string[] {
  const result: string[] = [];
  visitFlex(message.contents, (value) => {
    if (isRecord(value) && value.type === "text" && typeof value.text === "string") {
      result.push(value.text);
    }
  });
  return result;
}

function flexUris(message: NotificationLineFlexMessage): string[] {
  const result: string[] = [];
  visitFlex(message.contents, (value) => {
    if (!isRecord(value) || value.type !== "button" || !isRecord(value.action)) return;
    if (value.action.type === "uri" && typeof value.action.uri === "string") {
      result.push(value.action.uri);
    }
  });
  return result;
}

function flexButtonLabels(message: NotificationLineFlexMessage): string[] {
  const result: string[] = [];
  visitFlex(message.contents, (value) => {
    if (!isRecord(value) || value.type !== "button" || !isRecord(value.action)) return;
    if (value.action.type === "uri" && typeof value.action.label === "string") {
      result.push(value.action.label);
    }
  });
  return result;
}

function flexBodyTextsWithoutTitle(message: NotificationLineFlexMessage): string[] {
  const result: string[] = [];
  for (const component of message.contents.body.contents.slice(1)) {
    visitFlex(component, (value) => {
      if (isRecord(value) && value.type === "text" && typeof value.text === "string") {
        result.push(value.text);
      }
    });
  }
  return result;
}

function visitFlex(value: unknown, visitor: (value: unknown) => void) {
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) visitFlex(item, visitor);
    return;
  }
  if (!isRecord(value)) return;
  for (const item of Object.values(value)) visitFlex(item, visitor);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
