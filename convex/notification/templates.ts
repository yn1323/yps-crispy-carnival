import type { LegalDocumentInfo } from "../legal/documents";

type ShiftEntry = {
  date: string;
  timeLabel?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

function shiftTimeLabel(shift: ShiftEntry): string | null {
  if (shift.timeLabel !== undefined) return shift.timeLabel;
  return shift.startTime && shift.endTime ? `${shift.startTime}-${shift.endTime}` : null;
}

/**
 * LINE 用のシフト確定通知テキスト（プレーンテキスト・短文）
 * Push 1通には text を1メッセージで載せる
 */
export function buildShiftConfirmationLineText(params: {
  staffName: string;
  shopName: string;
  periodLabel: string;
  shifts: ShiftEntry[];
  magicLinkUrl: string;
  isResend: boolean;
}): string {
  const lines = [
    `${params.staffName}さん`,
    "",
    params.isResend
      ? `${params.shopName}\n${params.periodLabel} のシフトが変更されました。`
      : `${params.shopName}\n${params.periodLabel} のシフトが確定しました。`,
    "",
    "▼あなたのシフト",
    ...params.shifts.map((s) => {
      const timeLabel = shiftTimeLabel(s);
      return timeLabel ? `${s.date} ${timeLabel}` : `${s.date} 休み`;
    }),
    "",
    `全員分の確認はこちら（24時間有効）`,
    params.magicLinkUrl,
  ];
  return lines.join("\n");
}

/**
 * 募集開始通知（LINE 用テキスト）
 */
export function buildRecruitmentLineText(params: {
  staffName: string;
  shopName: string;
  periodLabel: string;
  deadline: string;
  magicLinkUrl: string;
}): string {
  return [
    `${params.staffName}さん`,
    "",
    `${params.shopName}\n${params.periodLabel} のシフト希望を提出してください。`,
    `提出締切: ${params.deadline}`,
    "",
    "提出はこちら",
    params.magicLinkUrl,
    "",
    "提出・修正は締切までです。提出後は、締切後もシフト確定まで内容を確認できます。",
  ].join("\n");
}

/**
 * 閲覧リンク再発行通知（LINE 用テキスト）
 */
export function buildReissueLineText(params: {
  staffName: string;
  shopName: string;
  periodLabel: string;
  magicLinkUrl: string;
}): string {
  return [
    `${params.staffName}さん`,
    "",
    `${params.shopName}\n${params.periodLabel} のシフト閲覧リンクを再発行しました。`,
    "",
    "シフトの確認はこちら（24時間有効）",
    params.magicLinkUrl,
  ].join("\n");
}

/**
 * 催促通知（LINE 用テキスト）
 */
export function buildReminderLineText(params: {
  staffName: string;
  shopName: string;
  periodLabel: string;
  linkExpiresAtLabel: string;
  magicLinkUrl: string;
}): string {
  return [
    `${params.staffName}さん`,
    "",
    `${params.shopName}\n${params.periodLabel} のシフト希望が、まだ提出されていないようです。`,
    `提出期限: ${params.linkExpiresAtLabel} まで`,
    "",
    "提出はこちら",
    params.magicLinkUrl,
    "",
    "提出・修正は期限までです。提出済みの場合は、期限後もシフト確定まで内容を確認できます。",
  ].join("\n");
}

type ConfirmationEmailParams = {
  staffName: string;
  periodLabel: string;
  shifts: ShiftEntry[];
  magicLinkUrl: string;
  reissueUrl: string;
  isResend: boolean;
  lineCtaHtml?: string;
};

type ReissueEmailParams = {
  staffName: string;
  periodLabel: string;
  magicLinkUrl: string;
};

function shiftRow(shift: ShiftEntry): string {
  const timeLabel = shiftTimeLabel(shift);
  if (timeLabel) {
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a202c;">${shift.date}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a202c;">${timeLabel}</td>
    </tr>`;
  }
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#a0aec0;">${shift.date}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#a0aec0;">休み</td>
  </tr>`;
}

export function buildConfirmationEmailHtml(params: ConfirmationEmailParams): string {
  const shiftRows = params.shifts.map(shiftRow).join("");
  const bodyMessage = params.isResend
    ? `${params.periodLabel} のシフトに変更がありました。<br/>最新のシフトをご確認ください。`
    : `${params.periodLabel} のシフトが確定しました。`;

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f7fafc;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background-color:#319795;padding:16px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;">シフトリ</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 24px;">
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.staffName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${bodyMessage}</p>

          <!-- Shift Table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td colspan="2" style="padding:10px 12px;background-color:#f7fafc;font-size:13px;font-weight:600;color:#4a5568;border-bottom:1px solid #e2e8f0;">あなたのシフト</td></tr>
            ${shiftRows}
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.magicLinkUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">全員のシフトを確認する</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">このリンクは24時間有効です。</p>
          <p style="margin:0 0 8px;font-size:13px;color:#718096;">リンクを開くと14日間閲覧できます。</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">期限切れの場合は<a href="${params.reissueUrl}" style="color:#319795;">こちら</a>から再発行できます。</p>

          ${params.lineCtaHtml ?? ""}

          <!-- Footer -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問・変更希望はシフト作成担当者に連絡してください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">※ このメールに返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

type RecruitmentEmailParams = {
  staffName: string;
  periodLabel: string;
  deadline: string; // フォーマット済み（例: "1/17(金)"）
  magicLinkUrl: string;
  lineCtaHtml?: string;
};

export function buildRecruitmentEmailHtml(params: RecruitmentEmailParams): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f7fafc;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background-color:#319795;padding:16px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;">シフトリ</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 24px;">
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.staffName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.periodLabel} のシフト希望を提出してください。</p>

          <!-- Deadline -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;background-color:#f7fafc;font-size:14px;color:#1a202c;">
              <strong>提出締切:</strong> ${params.deadline}
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.magicLinkUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">シフト希望を提出する</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">提出・修正は提出締切まで可能です。</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">提出後は、締切後もシフト確定までこのリンクから内容を確認できます。</p>

          ${params.lineCtaHtml ?? ""}

          <!-- Footer -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問はシフト作成担当者に連絡してください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">※ このメールに返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

type ReminderEmailParams = {
  staffName: string;
  periodLabel: string;
  linkExpiresAtLabel: string; // フォーマット済み（例: "5/6(月)"）
  magicLinkUrl: string;
  lineCtaHtml?: string;
};

export function buildReminderEmailHtml(params: ReminderEmailParams): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f7fafc;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background-color:#319795;padding:16px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;">シフトリ</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 24px;">
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.staffName}さん</p>
          <p style="margin:0 0 8px;font-size:15px;color:#1a202c;">${params.periodLabel} のシフト希望が、まだ提出されていないようです。</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">まだ提出していない場合は、こちらから送ってください。</p>

          <!-- Deadline -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;background-color:#f7fafc;font-size:14px;color:#1a202c;">
              <strong>提出期限:</strong> ${params.linkExpiresAtLabel} まで
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.magicLinkUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">シフト希望を提出する</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">以前のメールでお送りしたリンクとは別の新しいリンクです。</p>
          <p style="margin:0 0 8px;font-size:13px;color:#718096;">提出・修正は提出期限まで可能です。</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">すでに提出済みの場合は、期限後もシフト確定までリンクから内容を確認できます。</p>

          ${params.lineCtaHtml ?? ""}

          <!-- Footer -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問はシフト作成担当者に連絡してください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">※ このメールに返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

type LineInviteEmailParams = {
  staffName: string;
  shopName: string;
  authorizeUrl: string;
};

export function buildLineInviteEmailHtml(params: LineInviteEmailParams): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f7fafc;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#319795;padding:16px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;">シフトリ</span>
        </td></tr>
        <tr><td style="padding:32px 24px;">
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.staffName}さん</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">シフトのお知らせをLINEで受け取れるようになります。</p>
          <p style="margin:0 0 24px;font-size:14px;color:#4a5568;">下のボタンから連携できます。</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.authorizeUrl}" style="display:inline-block;padding:12px 32px;background-color:#06c755;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">LINE連携する</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">このリンクは72時間有効です。</p>
          <p style="margin:0 0 8px;font-size:13px;color:#718096;">期限が切れた場合は、シフト作成担当者に連絡してください。</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">LINE連携すると次回からメールではなく、LINEで届くようになります。</p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">${params.shopName} のシフト通知システムです。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">※ このメールに返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * 既存通知メール末尾の「LINEで受け取る」CTA セクション
 * - 未連携 / 友達解除済みのスタッフのみに表示する想定（呼び出し側で判定）
 */
export function buildLineCtaSection(params: { authorizeUrl: string; reLink: boolean }): string {
  const label = params.reLink ? "LINEを再連携する" : "LINE連携する";
  const note = params.reLink
    ? "LINEの友達追加が解除されているようです。再連携するとLINEで通知が届きます。"
    : "LINE連携すると次回からメールではなく、LINEで届くようになります。";
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-top:1px solid #e2e8f0;padding-top:24px;">
    <tr><td>
      <p style="margin:0 0 12px;font-size:13px;color:#4a5568;">${note}</p>
    </td></tr>
    <tr><td align="center">
      <a href="${params.authorizeUrl}" style="display:inline-block;padding:10px 24px;background-color:#06c755;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;" rel="noreferrer">${label}</a>
    </td></tr>
  </table>`;
}

type StaffLegalConsentEmailParams = {
  staffName: string;
  shopName: string;
  consentUrl: string;
  expiresAt: number;
  documents: {
    terms: LegalDocumentInfo;
    privacy: LegalDocumentInfo;
  };
};

function formatDateTimeJa(timestamp: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function buildStaffLegalConsentEmailHtml(params: StaffLegalConsentEmailParams): string {
  const expiresAtLabel = formatDateTimeJa(params.expiresAt);
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f7fafc;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#319795;padding:16px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;">シフトリ</span>
        </td></tr>
        <tr><td style="padding:32px 24px;">
          <p style="margin:0 0 20px;font-size:15px;color:#1a202c;">${params.staffName}さん</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">
            ${params.shopName} で利用するシフト管理サービス「シフトリ」のご案内です。<br/>
            シフトリでは、メール・LINEで届くリンクからシフト希望の提出や確定シフトの確認ができます。
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">下のリンクから、シフトリの使い方と利用規約・プライバシーポリシーをご確認ください。</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.consentUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">シフトリの案内と規約を確認する</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">このリンクは ${expiresAtLabel} まで有効です。</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">利用規約・プライバシーポリシーの同意が間に合わなくても、シフト募集・催促・確定シフトなどのお知らせは引き続き受け取れます。</p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#a0aec0;">※ このメールに返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildStaffLegalConsentLineText(params: {
  staffName: string;
  shopName: string;
  consentUrl: string;
  expiresAt: number;
}): string {
  return [
    `${params.staffName}さん`,
    "",
    `${params.shopName} で利用するシフト管理サービス「シフトリ」のご案内です。`,
    "シフトリでは、メール・LINEで届くリンクからシフト希望の提出や確定シフトの確認ができます。",
    "",
    "シフトリの使い方と、利用規約・プライバシーポリシーを確認できます。",
    "",
    "確認はこちら",
    params.consentUrl,
    "",
    `リンク有効期限: ${formatDateTimeJa(params.expiresAt)}`,
    "未同意でもシフトのお知らせは引き続き受け取れます。期限が切れた場合はシフト提出時にも同意できます。",
  ].join("\n");
}

export function buildReissueEmailHtml(params: ReissueEmailParams): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f7fafc;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background-color:#319795;padding:16px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;">シフトリ</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 24px;">
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.staffName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.periodLabel} のシフト閲覧リンクを再発行しました。</p>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.magicLinkUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">シフトを確認する</a>
            </td></tr>
          </table>

          <p style="margin:0 0 24px;font-size:13px;color:#718096;">このリンクは24時間有効です。リンクを開くと14日間閲覧できます。</p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問・変更希望はシフト作成担当者に連絡してください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">※ このメールに返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
