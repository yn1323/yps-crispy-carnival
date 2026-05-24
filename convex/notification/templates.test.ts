import { describe, expect, it } from "vitest";
import { buildConfirmationEmailHtml, buildShiftConfirmationLineText } from "./templates";

describe("notification/templates", () => {
  it("確定通知メールとLINEに日ごと・勤務区分ラベルを表示する", () => {
    const shifts = [
      { date: "1/20(火)", timeLabel: "出勤" },
      { date: "1/21(水)", timeLabel: "遅番（15:00-22:00）" },
      { date: "1/22(木)", timeLabel: null },
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

    expect(lineText).toContain("1/20(火) 出勤");
    expect(lineText).toContain("1/21(水) 遅番（15:00-22:00）");
    expect(lineText).toContain("1/22(木) 休み");
    expect(emailHtml).toContain("出勤");
    expect(emailHtml).toContain("遅番（15:00-22:00）");
    expect(emailHtml).toContain("休み");
  });
});
