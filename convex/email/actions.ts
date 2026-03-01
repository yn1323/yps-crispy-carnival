/**
 * メール送信ドメイン - アクション（外部API呼び出し）
 *
 * 責務:
 * - Resend APIを使用したメール送信
 * - シフト募集通知メールの送信
 */
import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "../_generated/server";

const FROM_EMAIL = "onboarding@resend.dev";

// シフト募集通知メール送信
export const sendRecruitmentNotification = internalAction({
  args: {
    shopName: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    deadline: v.string(),
    recipients: v.array(
      v.object({
        email: v.string(),
        magicLinkToken: v.string(),
      }),
    ),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY が設定されていません");
      return;
    }

    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    const subject = `【${args.shopName}】シフト募集のお知らせ（${args.startDate}〜${args.endDate}）`;

    for (const recipient of args.recipients) {
      try {
        const magicLinkUrl = `${appUrl}/shift-submit?token=${recipient.magicLinkToken}`;

        await resend.emails.send({
          from: FROM_EMAIL,
          to: recipient.email,
          subject,
          html: buildEmailHtml({
            shopName: args.shopName,
            startDate: args.startDate,
            endDate: args.endDate,
            deadline: args.deadline,
            magicLinkUrl,
          }),
        });
      } catch (e) {
        console.error(`メール送信失敗: ${recipient.email}`, e);
      }
    }
  },
});

// シフト確定通知メール送信
export const sendShiftConfirmationNotification = internalAction({
  args: {
    shopName: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    recipients: v.array(
      v.object({
        email: v.string(),
        magicLinkToken: v.string(),
      }),
    ),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY が設定されていません");
      return;
    }

    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    const subject = `【${args.shopName}】シフトが確定しました（${args.startDate}〜${args.endDate}）`;

    for (const recipient of args.recipients) {
      try {
        const magicLinkUrl = `${appUrl}/shift-submit?token=${recipient.magicLinkToken}`;

        await resend.emails.send({
          from: FROM_EMAIL,
          to: recipient.email,
          subject,
          html: buildConfirmationEmailHtml({
            shopName: args.shopName,
            startDate: args.startDate,
            endDate: args.endDate,
            magicLinkUrl,
          }),
        });
      } catch (e) {
        console.error(`メール送信失敗: ${recipient.email}`, e);
      }
    }
  },
});

// 募集通知メールHTML組み立て
const buildEmailHtml = (params: {
  shopName: string;
  startDate: string;
  endDate: string;
  deadline: string;
  magicLinkUrl: string;
}) => {
  return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>${params.shopName} のシフト募集が開始されました</h2>
  <table style="margin: 20px 0; border-collapse: collapse;">
    <tr>
      <td style="padding: 8px 16px 8px 0; font-weight: bold;">募集期間</td>
      <td style="padding: 8px 0;">${params.startDate} 〜 ${params.endDate}</td>
    </tr>
    <tr>
      <td style="padding: 8px 16px 8px 0; font-weight: bold;">申請締切</td>
      <td style="padding: 8px 0;">${params.deadline}</td>
    </tr>
  </table>
  <p>以下のリンクからシフトを申請してください:</p>
  <a href="${params.magicLinkUrl}" style="display: inline-block; background: #0d9488; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 12px 0;">シフトを申請する</a>
  <p style="color: #666; font-size: 14px; margin-top: 24px;">※ このリンクはあなた専用です。他の方と共有しないでください。</p>
</div>
`.trim();
};

// 確定通知メールHTML組み立て
const buildConfirmationEmailHtml = (params: {
  shopName: string;
  startDate: string;
  endDate: string;
  magicLinkUrl: string;
}) => {
  return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>${params.shopName} のシフトが確定しました</h2>
  <table style="margin: 20px 0; border-collapse: collapse;">
    <tr>
      <td style="padding: 8px 16px 8px 0; font-weight: bold;">シフト期間</td>
      <td style="padding: 8px 0;">${params.startDate} 〜 ${params.endDate}</td>
    </tr>
  </table>
  <p>以下のリンクから確定シフトを確認してください:</p>
  <a href="${params.magicLinkUrl}" style="display: inline-block; background: #0d9488; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 12px 0;">シフトを確認する</a>
  <p style="color: #666; font-size: 14px; margin-top: 24px;">※ このリンクはあなた専用です。他の方と共有しないでください。</p>
</div>
`.trim();
};
