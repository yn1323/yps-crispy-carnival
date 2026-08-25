import { describe, expect, it } from "vitest";
import { formatResendSubject } from "../_lib/emailFormat";
import { LEGAL_DOCUMENTS } from "../legal/documents";
import {
  buildConfirmationEmailHtml,
  buildLineCtaSection,
  buildLineDefaultReplyText,
  buildLineInviteEmailHtml,
  buildNotificationFailureReminderEmailHtml,
  buildNotificationFailureReminderLineFlexMessage,
  buildNotificationFailureReminderLineText,
  buildOrganizationBillingEmailHtml,
  buildOrganizationManagerInvitationEmailHtml,
  buildRecruitmentEmailHtml,
  buildRecruitmentLineFlexMessage,
  buildRecruitmentLineText,
  buildReissueEmailHtml,
  buildReissueLineFlexMessage,
  buildReminderEmailHtml,
  buildReminderLineFlexMessage,
  buildReminderLineText,
  buildShiftConfirmationLineFlexMessage,
  buildShiftConfirmationLineText,
  buildShiftConfirmationReminderEmailHtml,
  buildShiftConfirmationReminderLineFlexMessage,
  buildShiftConfirmationReminderLineText,
  buildShopActivationReminderEmailHtml,
  buildShopActivationReminderLineFlexMessage,
  buildShopActivationReminderLineText,
  buildStaffLegalConsentEmailHtml,
  buildStaffLegalConsentLineFlexMessage,
  buildStaffRegistrationOwnerDigestEmailHtml,
  buildStaffRegistrationOwnerDigestLineFlexMessage,
  buildStaffRegistrationOwnerDigestLineText,
  type NotificationLineFlexMessage,
  SHOP_ACTIVATION_REMINDER_SUBJECT,
  STAFF_LEGAL_CONSENT_SUBJECT,
  STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT,
} from "./templates";

describe("notification/templates", () => {
  const dangerousText = `店舗 & <script>alert("x")</script> ' 😀`;
  const escapedText = "店舗 &amp; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &#39; 😀";
  const dangerousUrl = `https://example.com/path?q=%E3%81%82&next="/><script>alert(1)</script>#frag`;
  const escapedUrl =
    "https://example.com/path?q=%E3%81%82&amp;next=&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt;#frag";

  const emailHtmlCases = [
    {
      name: "事業者管理者招待",
      build: () =>
        buildOrganizationManagerInvitationEmailHtml({
          recipientName: dangerousText,
          organizationName: dangerousText,
          inviterName: dangerousText,
          appUrl: dangerousUrl,
          helpUrl: dangerousUrl,
          invitationUrl: dangerousUrl,
        }),
      staticMarkup: [
        "シフトリとは",
        "スタッフの希望収集からシフト作成・共有までを支えるシフト管理サービスです。",
        "シフトリを見る",
        "シフトの募集、調整、共有が可能になります。",
        "管理者はシフトリへのアカウント登録が必要となります。",
        "シフトリの管理者になる操作手順",
        "シフトリの管理者招待を受け取る",
        "このリンクは7日間有効です。",
        "シフトリのヘルプページを見る",
      ],
    },
    {
      name: "事業者課金",
      build: () =>
        buildOrganizationBillingEmailHtml({
          recipientName: dangerousText,
          organizationName: dangerousText,
          heading: dangerousText,
          paragraphs: [dangerousText],
          action: { label: dangerousText, url: dangerousUrl },
        }),
      staticMarkup: ["このメールは送信専用です。<br />返信しても届きません。"],
    },
    {
      name: "シフト確定",
      build: () =>
        buildConfirmationEmailHtml({
          staffName: dangerousText,
          periodLabel: dangerousText,
          shifts: [{ date: dangerousText, timeLabel: dangerousText }],
          magicLinkUrl: dangerousUrl,
          reissueUrl: dangerousUrl,
          isResend: true,
        }),
      staticMarkup: ["<br />", "<tr>"],
    },
    {
      name: "シフト募集",
      build: () =>
        buildRecruitmentEmailHtml({
          staffName: dangerousText,
          periodLabel: dangerousText,
          deadline: dangerousText,
          magicLinkUrl: dangerousUrl,
        }),
      staticMarkup: ["<strong>提出締切：</strong>"],
    },
    {
      name: "提出締切案内",
      build: () =>
        buildReminderEmailHtml({
          staffName: dangerousText,
          periodLabel: dangerousText,
          linkExpiresAtLabel: dangerousText,
          magicLinkUrl: dangerousUrl,
        }),
      staticMarkup: ["<strong>提出締切：</strong>"],
    },
    {
      name: "LINE連携",
      build: () =>
        buildLineInviteEmailHtml({
          staffName: dangerousText,
          shopName: dangerousText,
          authorizeUrl: dangerousUrl,
        }),
      staticMarkup: ["LINE連携する"],
    },
    {
      name: "スタッフ登録申請",
      build: () =>
        buildStaffRegistrationOwnerDigestEmailHtml({
          managerName: dangerousText,
          dashboardUrl: dangerousUrl,
        }),
      staticMarkup: ["シフトリで確認する"],
    },
    {
      name: "通知失敗",
      build: () =>
        buildNotificationFailureReminderEmailHtml({
          managerName: dangerousText,
          dashboardUrl: dangerousUrl,
        }),
      staticMarkup: ["一部のスタッフに通知が正常に送信できませんでした。", "詳細はシフトリを確認ください。"],
    },
    {
      name: "店舗登録後リマインド",
      build: () =>
        buildShopActivationReminderEmailHtml({
          managerName: dangerousText,
          dashboardUrl: dangerousUrl,
        }),
      staticMarkup: ["シフトリでシフトを作成する"],
    },
    {
      name: "シフト確定リマインド",
      build: () =>
        buildShiftConfirmationReminderEmailHtml({
          managerName: dangerousText,
          periodLabel: dangerousText,
          deadlineLabel: dangerousText,
          dashboardUrl: dangerousUrl,
        }),
      staticMarkup: ["<strong>提出締切：</strong>"],
    },
    {
      name: "スタッフ法務同意",
      build: () =>
        buildStaffLegalConsentEmailHtml({
          staffName: dangerousText,
          shopName: dangerousText,
          consentUrl: dangerousUrl,
          expiresAt: new Date("2026-05-31T12:00:00+09:00").getTime(),
          documents: LEGAL_DOCUMENTS.staff,
        }),
      staticMarkup: ["シフトリの使い方を確認する"],
    },
    {
      name: "シフト閲覧リンク再発行",
      build: () =>
        buildReissueEmailHtml({
          staffName: dangerousText,
          periodLabel: dangerousText,
          magicLinkUrl: dangerousUrl,
        }),
      staticMarkup: ["シフトを確認する"],
    },
  ];

  it.each(emailHtmlCases)("$nameメールは動的な本文とURLをHTML escapeする", ({ build, staticMarkup }) => {
    const html = build();

    expect(html).toContain(escapedText);
    expect(html).toContain(`href="${escapedUrl}"`);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(`href="${dangerousUrl}"`);
    expect(html).not.toContain("&amp;amp;next=");
    expect(html).toContain("店舗");
    expect(html).toContain("😀");
    for (const markup of staticMarkup) {
      expect(html).toContain(markup);
    }
  });

  it("管理者招待メールは受取人から始まり、案内と各リンクを操作順に表示する", () => {
    const html = buildOrganizationManagerInvitationEmailHtml({
      recipientName: "佐藤 店長",
      organizationName: "さくらフードサービス",
      inviterName: "鈴木 花子",
      appUrl: "https://shiftori.app",
      helpUrl: "https://shiftori.app/help",
      invitationUrl: "https://shiftori.app/manager-invite?token=test-token",
    });

    const recipientIndex = html.indexOf("佐藤 店長さん");
    const invitationSourceIndex = html.indexOf("さくらフードサービスの鈴木 花子さんから、管理者として招待されました。");
    const serviceDescriptionIndex = html.indexOf(
      "スタッフの希望収集からシフト作成・共有までを支えるシフト管理サービスです。",
    );
    const appLinkIndex = html.indexOf(">シフトリを見る</a>");
    const capabilityIndex = html.indexOf("シフトの募集、調整、共有が可能になります。");

    expect(recipientIndex).toBeGreaterThan(-1);
    expect(recipientIndex).toBeLessThan(invitationSourceIndex);
    expect(serviceDescriptionIndex).toBeLessThan(appLinkIndex);
    expect(appLinkIndex).toBeLessThan(capabilityIndex);
    expect(html.match(/管理者として招待されました/g)).toHaveLength(1);
    expect(html).toContain("管理者はシフトリへのアカウント登録が必要となります。<br />");
    expect(html).toContain("すでに登録済みのアカウントがある場合は、そのアカウントに紐づけることも可能です。");
    expect(html).toContain("「シフトリの管理者招待を受け取る」ボタンを押す");
    expect(html).toContain("シフトリでアカウントを作成する（すでにお持ちの場合はログインする）");
    expect(html).toContain('href="https://shiftori.app"');
    expect(html).toContain(">シフトリを見る</a>");
    expect(html).toContain(
      'href="https://shiftori.app/manager-invite?token=test-token" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">シフトリの管理者招待を受け取る</a>',
    );
    expect(html).toContain('href="https://shiftori.app/help"');
    expect(html).toContain("このリンクは7日間有効です。");
    expect(html).not.toContain("一度だけ使用できます。");
  });

  it("メール本文の文間改行はHTMLをescapeしたまま表示改行へ変換する", () => {
    const billingHtml = buildOrganizationBillingEmailHtml({
      recipientName: "田中太郎",
      organizationName: "テストグループ",
      heading: "契約のお知らせ",
      paragraphs: [`最初の文です。\n${dangerousText}`],
    });
    const inviteHtml = buildLineInviteEmailHtml({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      authorizeUrl: "https://example.com/line/authorize",
      context: "registration_approved",
    });
    const reLinkCta = buildLineCtaSection({
      authorizeUrl: "https://example.com/line/authorize",
      reLink: true,
    });
    const legalConsentHtml = buildStaffLegalConsentEmailHtml({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      consentUrl: "https://example.com/legal/consent",
      expiresAt: new Date("2026-05-31T12:00:00+09:00").getTime(),
      documents: LEGAL_DOCUMENTS.staff,
    });
    const reissueHtml = buildReissueEmailHtml({
      staffName: "田中太郎",
      periodLabel: "2026年6月",
      magicLinkUrl: "https://example.com/shift/reissue",
    });

    expect(billingHtml).toContain(`最初の文です。<br />${escapedText}`);
    expect(billingHtml).not.toContain("最初の文です。\n");
    expect(inviteHtml).toContain("スタッフ登録が承認されました。<br />シフトのお知らせをLINEで受け取れます。");
    expect(inviteHtml).toContain(
      "下記ボタンからLINEと連携してください。<br />メールで受け取りを希望される場合は、無視してください。",
    );
    expect(reLinkCta).toContain(
      "シフトリ公式アカウントの友だち追加が解除されています。<br />もう一度友だち追加すると、同じ組織の所属店舗からシフトのお知らせをLINEで受け取れます。<br />LINEで送れない場合は、メールでお知らせすることがあります。",
    );
    expect(inviteHtml).not.toContain("LINE連携は同じ組織の所属店舗で共通です。");
    expect(legalConsentHtml).toContain("詳細は下記リンクから確認ください。");
    expect(reissueHtml).toContain("このリンクは24時間有効です。<br />全員分のシフトは14日間閲覧可能です。");
  });

  it("LINE CTAは内部生成したHTMLを維持し、authorizeUrlだけをescapeする", () => {
    const lineCtaHtml = buildLineCtaSection({ authorizeUrl: dangerousUrl, reLink: false });
    const emailHtml = buildRecruitmentEmailHtml({
      staffName: "田中太郎",
      periodLabel: "7/2(木)〜7/30(木)",
      deadline: "6/25(金) 23:59",
      magicLinkUrl: "https://example.com/shifts/submit?token=test",
      lineCtaHtml,
    });

    expect(lineCtaHtml).toContain("<table");
    expect(lineCtaHtml).toContain(`href="${escapedUrl}"`);
    expect(lineCtaHtml).not.toContain("<script>");
    expect(emailHtml).toContain(lineCtaHtml);
    expect(emailHtml).not.toContain("&lt;table");
  });

  it("募集開始通知は締切前の訂正文をメールとLINEで共通表示する", () => {
    const params = {
      staffName: "田中太郎",
      shopName: "テスト店舗",
      periodLabel: "7/2(木)〜7/30(木)",
      deadline: "6/25(金) 23:59",
      magicLinkUrl: "https://example.com/shifts/submit?token=test",
    };
    const emailHtml = buildRecruitmentEmailHtml(params);
    const lineText = buildRecruitmentLineText(params);
    const flex = buildRecruitmentLineFlexMessage(params);
    const copy = `${emailHtml}\n${lineText}\n${flex.altText}\n${flexTexts(flex).join("\n")}`;

    expect(copy).toContain("提出後も締切までは上記リンクから訂正が可能です。");
    expect(copy).toContain("シフト希望を提出する");
    expect(copy).not.toContain("希望シフトを提出する");
    expect(copy).not.toContain("提出・修正は締切までです。");
    expect(copy).not.toContain("提出済みの内容は、締切後もシフト確定まで確認できます。");
  });

  it("提出締切リマインダーは指定文言とCTAをメールとLINEで共通表示する", () => {
    const params = {
      staffName: "田中太郎",
      shopName: "テスト店舗",
      periodLabel: "7/2(木)〜7/30(木)",
      linkExpiresAtLabel: "6/25(金) 23:59",
      magicLinkUrl: "https://example.com/shifts/submit?token=test",
    };
    const emailHtml = buildReminderEmailHtml(params);
    const lineText = buildReminderLineText(params);
    const flex = buildReminderLineFlexMessage(params);
    const copy = `${emailHtml}\n${lineText}\n${flex.altText}\n${flexTexts(flex).join("\n")}`;

    expect(copy).toContain("7/2(木)〜7/30(木)の希望シフトの提出期限が近づいています。");
    expect(copy).toContain("締切までに提出をお願いします。");
    expect(copy).toContain("希望シフトを提出する");
    expect(copy).toContain("提出後も締切までは上記リンクから訂正が可能です。");
    expect(copy).not.toContain("シフト希望の提出締切が近づいています。");
    expect(copy).not.toContain("まだ提出していない場合は、締切までにシフト希望を提出してください。");
    expect(copy).not.toContain("提出・修正は締切までです。");
  });

  it("通知失敗案内は失敗内容とシフトリで確認するCTAを表示する", () => {
    const emailHtml = buildNotificationFailureReminderEmailHtml({
      managerName: "佐藤 店長",
      dashboardUrl: "https://shiftori.app/dashboard",
    });
    const flex = buildNotificationFailureReminderLineFlexMessage({
      shopName: "テスト店舗",
      dashboardUrl: "https://shiftori.app/dashboard",
    });

    expect(emailHtml).toContain(
      "一部のスタッフに通知が正常に送信できませんでした。<br />詳細はシフトリを確認ください。",
    );
    expect(emailHtml).toContain(">シフトリで確認する</a>");
    expect(emailHtml).toContain("このメールは送信専用です。</p>");
    expect(emailHtml).not.toContain("返信しても届きません。");
    expect(flexTexts(flex)).toEqual(
      expect.arrayContaining([
        "テスト店舗\n⚠️ 一部通知に失敗",
        "一部のスタッフに通知が正常に送信できませんでした。",
        "詳細はシフトリを確認ください。",
      ]),
    );
    expect(flexButtonLabels(flex)).toContain("シフトリで確認する");
  });

  it("LINE連携案内は共通文言とメール受け取りの選択肢を表示する", () => {
    const inviteHtml = buildLineInviteEmailHtml({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      authorizeUrl: "https://example.com/line/authorize",
    });
    const approvedInviteHtml = buildLineInviteEmailHtml({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      authorizeUrl: "https://example.com/line/authorize",
      context: "registration_approved",
    });
    const initialCta = buildLineCtaSection({
      authorizeUrl: "https://example.com/line/authorize",
      reLink: false,
    });
    const reLinkCta = buildLineCtaSection({
      authorizeUrl: "https://example.com/line/authorize",
      reLink: true,
    });

    for (const html of [inviteHtml, approvedInviteHtml]) {
      expect(html).toContain("シフトのお知らせをLINEで受け取れます。");
      expect(html).toContain(
        "下記ボタンからLINEと連携してください。<br />メールで受け取りを希望される場合は、無視してください。",
      );
      expect(html).toContain("LINE連携リンクは72時間有効です。");
      expect(html).toContain("期限が切れた場合は、ご連絡ください。");
      expect(html).not.toContain("LINE連携は同じ組織の所属店舗で共通です。");
    }
    expect(approvedInviteHtml).toContain("スタッフ登録が承認されました。<br />シフトのお知らせをLINEで受け取れます。");
    expect(inviteHtml).not.toContain("スタッフ登録が承認されました。");
    expect(initialCta).toContain("シフトのお知らせをLINEでも受け取れます。");
    expect(initialCta).not.toContain("LINE連携は同じ組織の所属店舗で共通です。");
    expect(reLinkCta).toContain("LINEで送れない場合は、メールでお知らせすることがあります。");
    expect(reLinkCta).toContain(
      "もう一度友だち追加すると、同じ組織の所属店舗からシフトのお知らせをLINEで受け取れます。",
    );
  });

  it("法務同意案内は利用用途、確認操作、期限を簡潔に伝える", () => {
    const expiresAt = new Date("2026-05-31T12:00:00+09:00").getTime();
    const emailHtml = buildStaffLegalConsentEmailHtml({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      consentUrl: "https://shiftori.app/legal/staff/consent?token=test",
      expiresAt,
      documents: LEGAL_DOCUMENTS.staff,
    });
    const flex = buildStaffLegalConsentLineFlexMessage({
      staffName: "田中太郎",
      shopName: "テスト店舗",
      consentUrl: "https://shiftori.app/legal/staff/consent?token=test",
      expiresAt,
    });
    const copy = `${emailHtml}\n${flex.altText}\n${flexTexts(flex).join("\n")}`;

    expect(copy).toContain("テスト店舗では、シフトの回収・共有に「シフトリ」を利用します。");
    expect(copy).toContain("詳細は下記リンクから確認ください。");
    expect(copy).toContain("このリンクは2026/5/31 12:00まで有効です。");
    expect(copy).not.toContain("シフトリでは、メール・LINEで届くリンクから");
    expect(emailHtml).toContain(">シフトリの使い方を確認する</a>");
    expect(flexTexts(flex)).toContain("テスト店舗\n📄 シフトリの使い方のご案内");
    expect(STAFF_LEGAL_CONSENT_SUBJECT).toBe("シフトリの使い方のご案内");
    expect(flexButtonLabels(flex)).toContain("シフトリの使い方を確認する");
  });

  it("magic linkを含む対象3リンクにnoreferrerを付ける", () => {
    const magicLinkUrl = "https://example.com/shifts/view?token=test";
    const reissueUrl = "https://example.com/shifts/reissue?recruitmentId=test";
    const confirmationHtml = buildConfirmationEmailHtml({
      staffName: "田中太郎",
      periodLabel: "1/20(火)〜1/22(木)",
      shifts: [{ date: "1/20(火)", timeLabel: "出勤" }],
      magicLinkUrl,
      reissueUrl,
      isResend: false,
    });
    const reissueHtml = buildReissueEmailHtml({
      staffName: "田中太郎",
      periodLabel: "1/20(火)〜1/22(木)",
      magicLinkUrl,
    });

    expect(anchorOpeningTag(confirmationHtml, magicLinkUrl)).toContain('rel="noreferrer"');
    expect(anchorOpeningTag(confirmationHtml, reissueUrl)).toContain('rel="noreferrer"');
    expect(anchorOpeningTag(reissueHtml, magicLinkUrl)).toContain('rel="noreferrer"');
  });

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
    expect(emailHtml).toContain("全員分のシフトは14日間閲覧可能です。");
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
    expect(flexBodyTextsWithoutTitle(flex)).toContain("1/20(火)〜1/22(木)のシフトが確定しました。");
    expect(flexBodyTextsWithoutTitle(flex).join("\n")).not.toContain("テスト店舗");
    expect(flexBodyTextsWithoutTitle(flex).join("\n")).not.toContain("全員のシフトを確認する");
    expect(flex.altText).not.toContain("24時間有効");
    expect(flexButtonLabels(flex)).toContain("全員のシフトを確認する");
    expect(flexUris(flex)).toContain("https://example.com/shifts/view?token=test&openExternalBrowser=1");
    expect(flex.contents.footer).toMatchObject({ paddingAll: "20px" });
    expect(flex.contents.footer?.paddingTop).toBeUndefined();
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
    expect(flexBodyTextsWithoutTitle(flex)).toContain("1/20(火)〜1/22(木)のシフトが変更されました。");
    expect(flexBodyTextsWithoutTitle(flex).join("\n")).not.toContain("テスト店舗");
    expect(flexBodyTextsWithoutTitle(flex).join("\n")).not.toContain("全員のシフトを確認する");
    expect(flex.altText).not.toContain("24時間有効");
    expect(flexButtonLabels(flex)).toContain("全員のシフトを確認する");
  });

  it("確定・変更通知Flexでは定休日を赤字で表示する", () => {
    for (const isResend of [false, true]) {
      const flex = buildShiftConfirmationLineFlexMessage({
        staffName: "田中太郎",
        shopName: "テスト店舗",
        periodLabel: "1/20(火)〜1/22(木)",
        shifts: [{ date: "1/21(水)", timeLabel: "定休日" }],
        magicLinkUrl: "https://example.com/shifts/view?token=test",
        isResend,
      });

      const closedDayLabel = flexTextComponents(flex).find((component) => component.text === "定休日");
      expect(closedDayLabel).toMatchObject({ color: "#E53E3E" });
    }
  });

  it("確定・変更通知メールでは定休日を赤字で表示する", () => {
    for (const isResend of [false, true]) {
      const emailHtml = buildConfirmationEmailHtml({
        staffName: "田中太郎",
        periodLabel: "1/20(火)〜1/22(木)",
        shifts: [{ date: "1/21(水)", timeLabel: "定休日" }],
        magicLinkUrl: "https://example.com/shifts/view?token=test",
        reissueUrl: "https://example.com/shifts/reissue?recruitmentId=test",
        isResend,
      });

      expect(emailHtml).toContain('font-weight:600;color:#E53E3E;">定休日</td>');
    }
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
      dashboardUrl: "https://shiftori.app/dashboard?org=org_target&shop=shop_target",
    });
    const failure = buildNotificationFailureReminderLineText({
      dashboardUrl: "https://shiftori.app/dashboard?org=org_target&shop=shop_target",
    });
    const shopActivation = buildShopActivationReminderLineText({
      dashboardUrl: "https://shiftori.app/dashboard?org=org_target&shop=shop_target",
    });

    expect(recruitment.startsWith("📩 シフト提出のお願い\n")).toBe(true);
    expect(reminder.startsWith("🔔 提出締切が近づいています\n")).toBe(true);
    expect(confirmationReminder.startsWith("⏰ 提出締切を過ぎています\n")).toBe(true);
    expect(failure.startsWith("⚠️ 一部通知に失敗\n")).toBe(true);
    expect(shopActivation.startsWith("📅 シフト作成の続き\n")).toBe(true);
    // ⚠️ は対応必須の通知失敗のみ。他の種別には使わない
    expect(recruitment).not.toContain("⚠️");
    expect(reminder).not.toContain("⚠️");
    expect(confirmationReminder).not.toContain("⚠️");
    expect(shopActivation).not.toContain("⚠️");
  });

  it("各Flex通知はtype, altText, 主要文言, CTA URLを保持する", () => {
    const dashboardUrl = "https://shiftori.app/dashboard?org=org_target&shop=shop_target";
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
        title: "テスト店舗\n📩 シフト提出のお願い",
        text: "提出締切：6/25(金) 23:59",
        label: "シフト希望を提出する",
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
        title: "テスト店舗\n🔔 提出締切が近づいています",
        text: "締切までに提出をお願いします。",
        label: "希望シフトを提出する",
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
        text: "7/2(木)〜7/30(木)のシフト閲覧リンクを再発行しました。",
        label: "シフトを確認する",
        uri: "https://example.com/shifts/view?token=test&openExternalBrowser=1",
      },
      {
        message: buildShiftConfirmationReminderLineFlexMessage({
          shopName: "テスト店舗",
          periodLabel: "7/2(木)〜7/30(木)",
          deadlineLabel: "6/30(火) 23:59",
          dashboardUrl,
        }),
        title: "テスト店舗\n⏰ 提出締切を過ぎています",
        text: "提出締切（6/30(火) 23:59）を過ぎています。",
        label: "シフトリで確認する",
        uri: `${dashboardUrl}&openExternalBrowser=1`,
      },
      {
        message: buildNotificationFailureReminderLineFlexMessage({ shopName: "テスト店舗", dashboardUrl }),
        title: "テスト店舗\n⚠️ 一部通知に失敗",
        text: "一部のスタッフに通知が正常に送信できませんでした。",
        label: "シフトリで確認する",
        uri: `${dashboardUrl}&openExternalBrowser=1`,
      },
      {
        message: buildShopActivationReminderLineFlexMessage({ shopName: "テスト店舗", dashboardUrl }),
        title: "テスト店舗\n📅 シフト作成の続き",
        text: "スタッフを追加して実際にシフトを回収してみましょう！",
        label: "シフトリでシフトを作成する",
        uri: `${dashboardUrl}&openExternalBrowser=1`,
      },
      {
        message: buildStaffRegistrationOwnerDigestLineFlexMessage({ shopName: "テスト店舗", dashboardUrl }),
        title: "テスト店舗\n📝 スタッフ登録申請",
        text: "スタッフ登録申請が届いています。",
        label: "シフトリで確認する",
        uri: `${dashboardUrl}&openExternalBrowser=1`,
      },
      {
        message: buildStaffLegalConsentLineFlexMessage({
          staffName: "田中太郎",
          shopName: "テスト店舗",
          consentUrl: "https://shiftori.app/legal/staff/consent?token=test",
          expiresAt: new Date("2026-05-31T12:00:00+09:00").getTime(),
        }),
        title: `テスト店舗\n📄 ${STAFF_LEGAL_CONSENT_SUBJECT}`,
        text: "詳細は下記リンクから確認ください。",
        label: "シフトリの使い方を確認する",
        uri: "https://shiftori.app/legal/staff/consent?token=test&openExternalBrowser=1",
      },
    ];

    for (const { message, title, text, label, uri } of flexMessages) {
      expect(message.type).toBe("flex");
      expect(message.altText.length).toBeGreaterThan(0);
      expect(flexTexts(message)).toContain(title);
      expect(flexTexts(message)).toContain(text);
      if (title !== `テスト店舗\n📄 ${STAFF_LEGAL_CONSENT_SUBJECT}`) {
        expect(flexBodyTextsWithoutTitle(message).join("\n")).not.toContain("テスト店舗");
      }
      expect(flexButtonLabels(message)).toContain(label);
      expect(flexUris(message)).toContain(uri);
    }
  });

  it("スタッフ登録申請のオーナー通知はダッシュボードリンクのみを案内し、申請者情報を含めない", () => {
    const dashboardUrl = "https://shiftori.app/dashboard?org=org_target&shop=shop_target";
    const lineText = buildStaffRegistrationOwnerDigestLineText({ dashboardUrl });
    const emailHtml = buildStaffRegistrationOwnerDigestEmailHtml({
      managerName: "店長",
      dashboardUrl,
    });

    expect(formatResendSubject("テスト店舗", STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT)).toBe(
      "【シフトリ：テスト店舗】スタッフ登録申請が届いています",
    );
    expect(lineText.startsWith("📝 スタッフ登録申請\n")).toBe(true);
    expect(lineText).toContain("スタッフ登録申請が届いています。");
    expect(lineText).toContain("シフトリで確認してください。");
    expect(lineText).toContain(`${dashboardUrl}&openExternalBrowser=1`);
    expect(emailHtml).toContain("スタッフ登録申請が届いています。");
    expect(emailHtml).toContain("シフトリで確認してください。");
    expect(emailHtml).toContain("シフトリで確認する");
    expect(emailHtml).toContain(dashboardUrl.replaceAll("&", "&amp;"));
    expect(`${lineText}\n${emailHtml}`).not.toContain("申請スタッフ");
    expect(`${lineText}\n${emailHtml}`).not.toContain("request@example.com");
  });

  it("店舗登録後の本番募集リマインダーはスタッフ追加と募集作成CTAを表示する", () => {
    const dashboardUrl = "https://shiftori.app/dashboard?org=org_target&shop=shop_target";
    const lineText = buildShopActivationReminderLineText({ dashboardUrl });
    const emailHtml = buildShopActivationReminderEmailHtml({
      managerName: "佐藤 店長",
      dashboardUrl,
    });

    expect(formatResendSubject("テスト店舗", SHOP_ACTIVATION_REMINDER_SUBJECT)).toBe(
      "【シフトリ：テスト店舗】最初のシフト募集をつくりましょう",
    );
    expect(lineText).toBe(
      [
        "📅 シフト作成の続き",
        "",
        "店舗を登録してから1週間が経過しました。",
        "",
        "スタッフを追加して実際にシフトを回収してみましょう！",
        "",
        "シフトリでシフトを作成する",
        `${dashboardUrl}&openExternalBrowser=1`,
      ].join("\n"),
    );
    expect(emailHtml).toContain("佐藤 店長さん");
    expect(emailHtml).toContain("店舗を登録してから1週間が経過しました。");
    expect(emailHtml).toContain("スタッフを追加して実際にシフトを回収してみましょう！");
    expect(emailHtml).toContain("シフトリでシフトを作成する");
    expect(emailHtml).toContain(dashboardUrl.replaceAll("&", "&amp;"));
    expect(emailHtml).not.toContain("openExternalBrowser=1");
  });

  it("LINEの通常返信文はテンプレートから生成する", () => {
    const text = buildLineDefaultReplyText();

    expect(text).toContain("シフトリの通知用アカウントです。");
    expect(text).toContain(
      "シフトの確認や提出は、シフト作成担当者から届くメールまたはLINEのリンクから行ってください。",
    );
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

function flexTextComponents(message: NotificationLineFlexMessage): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  visitFlex(message.contents, (value) => {
    if (isRecord(value) && value.type === "text" && typeof value.text === "string") {
      result.push(value);
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

function anchorOpeningTag(html: string, href: string): string {
  const start = html.indexOf(`<a href="${href}"`);
  if (start === -1) return "";
  const end = html.indexOf(">", start);
  return end === -1 ? "" : html.slice(start, end + 1);
}
