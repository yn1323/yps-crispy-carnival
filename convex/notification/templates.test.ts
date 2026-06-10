import { describe, expect, it } from "vitest";
import { formatResendSubject } from "../_lib/emailFormat";
import {
  buildConfirmationEmailHtml,
  buildLineDefaultReplyText,
  buildShiftConfirmationLineText,
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
