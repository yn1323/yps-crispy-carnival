import { formatDateTimeJa } from "../_lib/dateFormat";
import { withOpenExternalBrowser } from "../_lib/lineUrl";
import { formatShiftClockTimeRange } from "../_lib/time";
import type { LegalDocumentInfo } from "../legal/documents";

type ShiftEntry = {
  date: string;
  timeLabel?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

function shiftTimeLabel(shift: ShiftEntry): string | null {
  if (shift.timeLabel !== undefined) return shift.timeLabel;
  return shift.startTime && shift.endTime ? formatShiftClockTimeRange(shift.startTime, shift.endTime, "-") : null;
}

const FLEX_ALT_TEXT_MAX_LENGTH = 1500;
const FLEX_PRIMARY_COLOR = "#319795";
const FLEX_TEXT_COLOR = "#1A202C";
const FLEX_MUTED_COLOR = "#718096";
const FLEX_BORDER_COLOR = "#E2E8F0";

export type LineTextMessage = {
  type: "text";
  text: string;
};

export type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: unknown;
};

export type LinePushMessage = LineTextMessage | LineFlexMessage;

type FlexTextComponent = {
  type: "text";
  text: string;
  size?: string;
  weight?: string;
  color?: string;
  wrap?: boolean;
  margin?: string;
  align?: string;
  flex?: number;
};

type FlexSeparatorComponent = {
  type: "separator";
  margin?: string;
  color?: string;
};

type FlexButtonComponent = {
  type: "button";
  style?: string;
  color?: string;
  height?: string;
  margin?: string;
  action: {
    type: "uri";
    label: string;
    uri: string;
  };
};

type FlexBoxComponent = {
  type: "box";
  layout: "vertical" | "horizontal" | "baseline";
  contents: FlexComponent[];
  spacing?: string;
  margin?: string;
  paddingAll?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingStart?: string;
  paddingEnd?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  cornerRadius?: string;
};

type FlexComponent = FlexTextComponent | FlexSeparatorComponent | FlexButtonComponent | FlexBoxComponent;

type FlexBubble = {
  type: "bubble";
  size?: string;
  body: FlexBoxComponent;
  footer?: FlexBoxComponent;
  styles?: {
    footer?: {
      separator?: boolean;
      separatorColor?: string;
    };
  };
};

export type NotificationLineFlexMessage = LineFlexMessage & {
  contents: FlexBubble;
};

function truncateFlexAltText(text: string): string {
  if (text.length <= FLEX_ALT_TEXT_MAX_LENGTH) return text;
  let truncated = text.slice(0, FLEX_ALT_TEXT_MAX_LENGTH - 1);
  if (/[\uD800-\uDBFF]$/.test(truncated)) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function flexText(text: string, options: Omit<FlexTextComponent, "type" | "text"> = {}): FlexTextComponent {
  return { type: "text", text, wrap: true, color: FLEX_TEXT_COLOR, ...options };
}

function flexBox(
  layout: FlexBoxComponent["layout"],
  contents: FlexComponent[],
  options: Omit<FlexBoxComponent, "type" | "layout" | "contents"> = {},
): FlexBoxComponent {
  return { type: "box", layout, contents, ...options };
}

function flexTitle(title: string): FlexTextComponent {
  return flexText(title, { size: "lg", weight: "bold" });
}

function flexTitleWithShop(shopName: string, title: string): string {
  return `${shopName}\n${title}`;
}

function flexBodyText(text: string): FlexTextComponent {
  return flexText(text, { size: "sm" });
}

function flexMutedText(text: string): FlexTextComponent {
  return flexText(text, { size: "xs", color: FLEX_MUTED_COLOR });
}

function flexMetaText(text: string): FlexTextComponent {
  return flexText(text, { size: "sm", weight: "bold" });
}

function flexSeparator(margin: string = "md"): FlexSeparatorComponent {
  return { type: "separator", margin, color: FLEX_BORDER_COLOR };
}

function flexUriButton(label: string, uri: string): FlexButtonComponent {
  return {
    type: "button",
    style: "primary",
    color: FLEX_PRIMARY_COLOR,
    height: "sm",
    action: { type: "uri", label, uri: withOpenExternalBrowser(uri) },
  };
}

function buildFlexMessage(params: {
  altText: string;
  title: string;
  body: FlexComponent[];
  cta?: {
    label: string;
    uri: string;
  };
}): NotificationLineFlexMessage {
  return {
    type: "flex",
    altText: truncateFlexAltText(params.altText),
    contents: {
      type: "bubble",
      size: "mega",
      body: flexBox("vertical", [flexTitle(params.title), flexSeparator(), ...params.body], {
        paddingAll: "20px",
        spacing: "md",
      }),
      ...(params.cta
        ? {
            footer: flexBox("vertical", [flexUriButton(params.cta.label, params.cta.uri)], {
              paddingAll: "20px",
            }),
            styles: { footer: { separator: true, separatorColor: FLEX_BORDER_COLOR } },
          }
        : {}),
    },
  };
}

function flexShiftRows(shifts: ShiftEntry[]): FlexBoxComponent {
  return flexBox(
    "vertical",
    [
      flexText("▼あなたのシフト", { size: "sm", weight: "bold" }),
      ...shifts.map((shift) => {
        const timeLabel = shiftTimeLabel(shift);
        const isRest = !timeLabel;
        return flexBox(
          "horizontal",
          [
            flexText(shift.date, { size: "sm", color: isRest ? FLEX_MUTED_COLOR : FLEX_TEXT_COLOR, flex: 2 }),
            flexText(timeLabel ?? "休み", {
              size: "sm",
              color: isRest ? FLEX_MUTED_COLOR : FLEX_TEXT_COLOR,
              weight: isRest ? "regular" : "bold",
              align: "end",
              flex: 3,
            }),
          ],
          { spacing: "md" },
        );
      }),
    ],
    { spacing: "sm", margin: "lg" },
  );
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
    params.isResend ? "🔁 シフト変更" : "✅ シフト確定",
    "",
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
    "全員分の確認はこちら",
    withOpenExternalBrowser(params.magicLinkUrl),
  ];
  return lines.join("\n");
}

export function buildShiftConfirmationLineFlexMessage(params: {
  staffName: string;
  shopName: string;
  periodLabel: string;
  shifts: ShiftEntry[];
  magicLinkUrl: string;
  isResend: boolean;
}): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildShiftConfirmationLineText(params),
    title: flexTitleWithShop(params.shopName, params.isResend ? "🔁 シフト変更" : "✅ シフト確定"),
    body: [
      flexBodyText(`${params.staffName}さん`),
      flexBodyText(
        params.isResend
          ? `${params.periodLabel} のシフトが変更されました。`
          : `${params.periodLabel} のシフトが確定しました。`,
      ),
      flexShiftRows(params.shifts),
    ],
    cta: { label: "全員分の確認はこちら", uri: params.magicLinkUrl },
  });
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
    "📩 提出依頼",
    "",
    `${params.staffName}さん`,
    "",
    `${params.shopName}\n${params.periodLabel} のシフト希望を提出してください。`,
    `提出締切：${params.deadline}`,
    "",
    "提出はこちら",
    withOpenExternalBrowser(params.magicLinkUrl),
    "",
    "提出・修正は提出締切までです。提出後は、締切後もシフト確定まで内容を確認できます。",
  ].join("\n");
}

export function buildRecruitmentLineFlexMessage(params: {
  staffName: string;
  shopName: string;
  periodLabel: string;
  deadline: string;
  magicLinkUrl: string;
}): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildRecruitmentLineText(params),
    title: flexTitleWithShop(params.shopName, "📩 提出依頼"),
    body: [
      flexBodyText(`${params.staffName}さん`),
      flexBodyText(`${params.periodLabel} のシフト希望を提出してください。`),
      flexMetaText(`提出締切：${params.deadline}`),
      flexMutedText("提出・修正は提出締切までです。提出後は、締切後もシフト確定まで内容を確認できます。"),
    ],
    cta: { label: "提出はこちら", uri: params.magicLinkUrl },
  });
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
    "🔁 リンク再発行",
    "",
    `${params.staffName}さん`,
    "",
    `${params.shopName}\n${params.periodLabel} のシフト閲覧リンクを再発行しました。`,
    "",
    "シフトの確認はこちら",
    withOpenExternalBrowser(params.magicLinkUrl),
  ].join("\n");
}

export function buildReissueLineFlexMessage(params: {
  staffName: string;
  shopName: string;
  periodLabel: string;
  magicLinkUrl: string;
}): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildReissueLineText(params),
    title: flexTitleWithShop(params.shopName, "🔁 リンク再発行"),
    body: [
      flexBodyText(`${params.staffName}さん`),
      flexBodyText(`${params.periodLabel} のシフト閲覧リンクを再発行しました。`),
    ],
    cta: { label: "シフトの確認はこちら", uri: params.magicLinkUrl },
  });
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
    "🔔 提出リマインド",
    "",
    `${params.staffName}さん`,
    "",
    `${params.shopName}\n${params.periodLabel} のシフト希望の提出締切が近づいています。`,
    "まだ提出されていないようです。早めに提出してください。",
    `提出締切：${params.linkExpiresAtLabel}`,
    "",
    "提出はこちら",
    withOpenExternalBrowser(params.magicLinkUrl),
    "",
    "提出・修正は提出締切までです。提出済みの場合は、締切後もシフト確定まで内容を確認できます。",
  ].join("\n");
}

export function buildReminderLineFlexMessage(params: {
  staffName: string;
  shopName: string;
  periodLabel: string;
  linkExpiresAtLabel: string;
  magicLinkUrl: string;
}): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildReminderLineText(params),
    title: flexTitleWithShop(params.shopName, "🔔 提出リマインド"),
    body: [
      flexBodyText(`${params.staffName}さん`),
      flexBodyText(`${params.periodLabel} のシフト希望の提出締切が近づいています。`),
      flexBodyText("まだ提出されていないようです。早めに提出してください。"),
      flexMetaText(`提出締切：${params.linkExpiresAtLabel}`),
      flexMutedText("提出・修正は提出締切までです。提出済みの場合は、締切後もシフト確定まで内容を確認できます。"),
    ],
    cta: { label: "提出はこちら", uri: params.magicLinkUrl },
  });
}

export function buildLineDefaultReplyText(): string {
  return [
    "シフトリの通知用アカウントです。",
    "シフトの確認や提出は、シフト作成担当者から届くメールまたはLINEのリンクからお願いします。",
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
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>
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
              <strong>提出締切：</strong> ${params.deadline}
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.magicLinkUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">シフト希望を提出する</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">提出・修正は提出締切までです。</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">提出後は、締切後もシフト確定までこのリンクから内容を確認できます。</p>

          ${params.lineCtaHtml ?? ""}

          <!-- Footer -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問はシフト作成担当者に連絡してください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>
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
          <p style="margin:0 0 8px;font-size:15px;color:#1a202c;">${params.periodLabel} のシフト希望の提出締切が近づいています。</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">まだ提出されていないようです。早めに提出してください。</p>

          <!-- Deadline -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;background-color:#f7fafc;font-size:14px;color:#1a202c;">
              <strong>提出締切：</strong> ${params.linkExpiresAtLabel}
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.magicLinkUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">シフト希望を提出する</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">提出・修正は提出締切までです。</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">すでに提出済みの場合は、締切後もシフト確定までリンクから内容を確認できます。</p>

          ${params.lineCtaHtml ?? ""}

          <!-- Footer -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問はシフト作成担当者に連絡してください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>
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
  context?: "default" | "registration_approved";
};

export function buildLineInviteEmailHtml(params: LineInviteEmailParams): string {
  const lead =
    params.context === "registration_approved"
      ? "スタッフ登録が承認されました。LINE連携をすると、シフトのお知らせをLINEで受け取れます。"
      : "シフトのお知らせをLINEで受け取れるようになります。";
  const description =
    params.context === "registration_approved"
      ? "続けて、下のボタンからLINE連携をお願いします。"
      : "下のボタンから連携できます。";
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
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">${lead}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#4a5568;">${description}</p>

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
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>
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
    ? "シフトリ公式アカウントの友だち追加が解除されています。再連携するとLINEで通知が届きます。"
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

export const STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT = "スタッフ登録申請が届いています";

type StaffRegistrationOwnerDigestParams = {
  dashboardUrl: string;
};

export function buildStaffRegistrationOwnerDigestLineText(params: StaffRegistrationOwnerDigestParams): string {
  return [
    "📝 スタッフ登録申請",
    "",
    "スタッフ登録申請が届いています。",
    "シフトリのダッシュボードで確認してください。",
    "",
    withOpenExternalBrowser(params.dashboardUrl),
  ].join("\n");
}

export function buildStaffRegistrationOwnerDigestLineFlexMessage(
  params: StaffRegistrationOwnerDigestParams & { shopName: string },
): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildStaffRegistrationOwnerDigestLineText(params),
    title: flexTitleWithShop(params.shopName, "📝 スタッフ登録申請"),
    body: [
      flexBodyText("スタッフ登録申請が届いています。"),
      flexBodyText("シフトリのダッシュボードで確認してください。"),
    ],
    cta: { label: "ダッシュボードを確認", uri: params.dashboardUrl },
  });
}

export function buildStaffRegistrationOwnerDigestEmailHtml(
  params: StaffRegistrationOwnerDigestParams & { managerName: string },
): string {
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
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.managerName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">スタッフ登録申請が届いています。<br/>シフトリのダッシュボードで確認してください。</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.dashboardUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">ダッシュボードを確認する</a>
            </td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールは送信専用です。返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const NOTIFICATION_FAILURE_REMINDER_SUBJECT = "送れなかった通知があります";

type NotificationFailureReminderParams = {
  dashboardUrl: string;
};

export function buildNotificationFailureReminderLineText(params: NotificationFailureReminderParams): string {
  return [
    "⚠️ 送れなかった通知",
    "",
    "通知を送れなかったスタッフがいます。",
    "シフトリのダッシュボードを開いて、再送してください。",
    "",
    withOpenExternalBrowser(params.dashboardUrl),
  ].join("\n");
}

export function buildNotificationFailureReminderLineFlexMessage(
  params: NotificationFailureReminderParams & { shopName: string },
): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildNotificationFailureReminderLineText(params),
    title: flexTitleWithShop(params.shopName, "⚠️ 送れなかった通知"),
    body: [
      flexBodyText("通知を送れなかったスタッフがいます。"),
      flexBodyText("シフトリのダッシュボードを開いて、再送してください。"),
    ],
    cta: { label: "ダッシュボードを確認", uri: params.dashboardUrl },
  });
}

export function buildNotificationFailureReminderEmailHtml(
  params: NotificationFailureReminderParams & { managerName: string },
): string {
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
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.managerName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">通知を送れなかったスタッフがいます。<br/>シフトリのダッシュボードを開いて、再送してください。</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.dashboardUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">ダッシュボードを確認する</a>
            </td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールは送信専用です。返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const SHOP_ACTIVATION_REMINDER_SUBJECT = "最初のシフト募集をつくりましょう";

type ShopActivationReminderParams = {
  dashboardUrl: string;
};

export function buildShopActivationReminderLineText(params: ShopActivationReminderParams): string {
  return [
    "📅 シフト作成の続き",
    "",
    "シフトリで店舗登録が完了してから1週間経過しました。",
    "",
    "スタッフを追加して実際にシフトを回収してみましょう！",
    "",
    "シフト募集をつくる",
    withOpenExternalBrowser(params.dashboardUrl),
  ].join("\n");
}

export function buildShopActivationReminderLineFlexMessage(
  params: ShopActivationReminderParams & { shopName: string },
): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildShopActivationReminderLineText(params),
    title: flexTitleWithShop(params.shopName, "📅 シフト作成の続き"),
    body: [
      flexBodyText("シフトリで店舗登録が完了してから1週間経過しました。"),
      flexBodyText("スタッフを追加して実際にシフトを回収してみましょう！"),
    ],
    cta: { label: "シフト募集をつくる", uri: params.dashboardUrl },
  });
}

export function buildShopActivationReminderEmailHtml(
  params: ShopActivationReminderParams & { managerName: string },
): string {
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
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.managerName}さん</p>
          <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1a202c;">📅 シフト作成の続き</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">シフトリで店舗登録が完了してから1週間経過しました。</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">スタッフを追加して実際にシフトを回収してみましょう！</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <p style="margin:0 0 12px;font-size:15px;color:#1a202c;">シフト募集をつくる</p>
              <a href="${params.dashboardUrl}" style="color:#319795;font-size:14px;font-weight:600;word-break:break-all;" rel="noreferrer">${params.dashboardUrl}</a>
            </td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールは送信専用です。返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const SHIFT_CONFIRMATION_REMINDER_SUBJECT = "シフトの確定をお願いします";

type ShiftConfirmationReminderParams = {
  periodLabel: string;
  deadlineLabel: string; // フォーマット済み（例: "1/17(金) 23:59"）
  dashboardUrl: string;
};

export function buildShiftConfirmationReminderLineText(params: ShiftConfirmationReminderParams): string {
  return [
    "⏰ 提出締切を過ぎています",
    "",
    `${params.periodLabel} のシフトがまだ確定していません。`,
    `提出締切（${params.deadlineLabel}）を過ぎています。`,
    "スタッフの希望を確認して、シフトを調整・確定してください。",
    "",
    "シフトの確定はこちら",
    withOpenExternalBrowser(params.dashboardUrl),
  ].join("\n");
}

export function buildShiftConfirmationReminderLineFlexMessage(
  params: ShiftConfirmationReminderParams & { shopName: string },
): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildShiftConfirmationReminderLineText(params),
    title: flexTitleWithShop(params.shopName, "⏰ 提出締切を過ぎています"),
    body: [
      flexBodyText(`${params.periodLabel} のシフトがまだ確定していません。`),
      flexMetaText(`提出締切（${params.deadlineLabel}）を過ぎています。`),
      flexBodyText("スタッフの希望を確認して、シフトを調整・確定してください。"),
    ],
    cta: { label: "シフトの確定はこちら", uri: params.dashboardUrl },
  });
}

export function buildShiftConfirmationReminderEmailHtml(
  params: ShiftConfirmationReminderParams & { managerName: string },
): string {
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
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${params.managerName}さん</p>
          <p style="margin:0 0 8px;font-size:15px;color:#1a202c;">${params.periodLabel} のシフトがまだ確定していません。</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">スタッフの希望を確認して、シフトを調整・確定してください。</p>

          <!-- Deadline -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;background-color:#f7fafc;font-size:14px;color:#1a202c;">
              <strong>提出締切：</strong> ${params.deadlineLabel}（締切済み）
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${params.dashboardUrl}" style="display:inline-block;padding:12px 32px;background-color:#319795;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">シフトを確定する</a>
            </td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールは送信専用です。返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>
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
    "📄 ご案内",
    "",
    `${params.staffName}さん`,
    "",
    `${params.shopName} で利用するシフト管理サービス「シフトリ」のご案内です。`,
    "シフトリでは、メール・LINEで届くリンクからシフト希望の提出や確定シフトの確認ができます。",
    "",
    "シフトリの使い方と、利用規約・プライバシーポリシーを確認できます。",
    "",
    "確認はこちら",
    withOpenExternalBrowser(params.consentUrl),
    "",
    `リンクの有効期限：${formatDateTimeJa(params.expiresAt)}`,
    "まだ同意していなくても、シフトのお知らせは引き続き受け取れます。期限が切れた場合はシフト提出時にも同意できます。",
  ].join("\n");
}

export function buildStaffLegalConsentLineFlexMessage(params: {
  staffName: string;
  shopName: string;
  consentUrl: string;
  expiresAt: number;
}): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildStaffLegalConsentLineText(params),
    title: flexTitleWithShop(params.shopName, "📄 ご案内"),
    body: [
      flexBodyText(`${params.staffName}さん`),
      flexBodyText("シフト管理サービス「シフトリ」のご案内です。"),
      flexBodyText("シフトリでは、メール・LINEで届くリンクからシフト希望の提出や確定シフトの確認ができます。"),
      flexBodyText("シフトリの使い方と、利用規約・プライバシーポリシーを確認できます。"),
      flexMetaText(`リンクの有効期限：${formatDateTimeJa(params.expiresAt)}`),
      flexMutedText(
        "まだ同意していなくても、シフトのお知らせは引き続き受け取れます。期限が切れた場合はシフト提出時にも同意できます。",
      ),
    ],
    cta: { label: "確認はこちら", uri: params.consentUrl },
  });
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
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
