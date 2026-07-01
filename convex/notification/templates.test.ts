import { describe, expect, it } from "vitest";
import { formatResendSubject } from "../_lib/emailFormat";
import {
  buildConfirmationEmailHtml,
  buildLineDefaultReplyText,
  buildNotificationFailureReminderLineText,
  buildRecruitmentLineText,
  buildReminderLineText,
  buildShiftConfirmationLineText,
  buildShiftConfirmationReminderLineText,
  buildStaffRegistrationOwnerDigestEmailHtml,
  buildStaffRegistrationOwnerDigestLineText,
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

    expect(recruitment.startsWith("📩 提出依頼\n")).toBe(true);
    expect(reminder.startsWith("🔔 提出リマインド\n")).toBe(true);
    expect(confirmationReminder.startsWith("⏰ 締切超過\n")).toBe(true);
    expect(failure.startsWith("⚠️ 通知失敗\n")).toBe(true);
    // ⚠️ は対応必須の通知失敗のみ。他の種別には使わない
    expect(recruitment).not.toContain("⚠️");
    expect(reminder).not.toContain("⚠️");
    expect(confirmationReminder).not.toContain("⚠️");
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

  it("LINEの通常返信文はテンプレートから生成する", () => {
    const text = buildLineDefaultReplyText();

    expect(text).toContain("シフトリの通知用アカウントです。");
    expect(text).toContain("メール／LINEのリンクからお願いします。");
  });
});
