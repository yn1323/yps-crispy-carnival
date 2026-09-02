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
const CLOSED_DAY_COLOR = "#E53E3E";
const FLEX_BORDER_COLOR = "#E2E8F0";
const ALL_SHIFTS_VIEWING_PERIOD = "全員分のシフトは14日間閲覧可能です。";
const SHIFT_CONFIRMATION_CTA = "全員のシフトを確認する";
const SHIFT_SUBMISSION_CTA = "希望シフトを提出する";
const SHIFT_SUBMISSION_REMINDER_CTA = "希望シフトを提出する";
const SHIFT_SUBMISSION_REMINDER_PERIOD = (periodLabel: string) =>
  `${periodLabel}の希望シフトの提出期限が近づいています。`;
const SHIFT_SUBMISSION_REMINDER_PENDING = "提出期限までに提出をお願いします。";
const SHIFT_SUBMISSION_CORRECTION_NOTE = "提出後も提出期限まではリンクから訂正が可能です。";
const SHIFTORI_CONFIRMATION_CTA = "シフトリで確認する";
const SHIFT_CONFIRMATION_REMINDER_PERIOD = (periodLabel: string) =>
  `${periodLabel}の希望シフトは提出期限を過ぎました。`;
const SHIFT_CONFIRMATION_REMINDER_ACTION = "シフトの調整・確定してください。";
const SHOP_ACTIVATION_CTA = "シフトリでシフトを作成する";
const SHOP_ACTIVATION_PERIOD = "店舗を登録してから1週間が経過しました。";
const SHOP_ACTIVATION_ACTION = "スタッフを追加して実際にシフトを回収してみましょう！";
const STAFF_REGISTRATION_OWNER_MESSAGE = "スタッフ登録申請が届いています。";
const STAFF_REGISTRATION_OWNER_DETAIL = "シフトリで確認して承認してください。";
const STAFF_REGISTRATION_OWNER_CTA = SHIFTORI_CONFIRMATION_CTA;
export const STAFF_LEGAL_CONSENT_SUBJECT = "シフトリの使い方のご案内";
const STAFF_LEGAL_CONSENT_CTA = "シフトリの使い方を確認する";
const STAFF_LEGAL_CONSENT_DETAIL = "詳細はリンクから確認ください。";
const staffLegalConsentUsage = (shopName: string) => `${shopName}では、シフトの回収・共有に「シフトリ」を利用します。`;
const staffLegalConsentExpiry = (expiresAtLabel: string) => `このリンクは${expiresAtLabel}まで有効です。`;
const recruitmentRequest = (periodLabel: string) => `${periodLabel}の希望シフトを提出してください。`;
const reissueMessage = (periodLabel: string) => `${periodLabel}のシフト閲覧リンクを再発行しました。`;
const REISSUE_CTA = "シフトを確認する";

export const buildRecruitmentEmailSubject = (periodLabel: string) => `${periodLabel} 希望シフトの提出をお願いします`;
export const buildReminderEmailSubject = (periodLabel: string) => `${periodLabel} 希望シフトの提出期限が近づいています`;

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
        const isClosedDay = timeLabel === "定休日";
        const isRest = !timeLabel;
        const timeColor = isClosedDay ? CLOSED_DAY_COLOR : isRest ? FLEX_MUTED_COLOR : FLEX_TEXT_COLOR;
        return flexBox(
          "horizontal",
          [
            flexText(shift.date, { size: "sm", color: isRest ? FLEX_MUTED_COLOR : FLEX_TEXT_COLOR, flex: 2 }),
            flexText(timeLabel ?? "休み", {
              size: "sm",
              color: timeColor,
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
      ? `${params.shopName}\n${params.periodLabel}のシフトが変更されました。`
      : `${params.shopName}\n${params.periodLabel}のシフトが確定しました。`,
    "",
    "▼あなたのシフト",
    ...params.shifts.map((s) => {
      const timeLabel = shiftTimeLabel(s);
      return timeLabel ? `${s.date} ${timeLabel}` : `${s.date} 休み`;
    }),
    "",
    SHIFT_CONFIRMATION_CTA,
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
          ? `${params.periodLabel}のシフトが変更されました。`
          : `${params.periodLabel}のシフトが確定しました。`,
      ),
      flexShiftRows(params.shifts),
    ],
    cta: { label: SHIFT_CONFIRMATION_CTA, uri: params.magicLinkUrl },
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
    "📩 シフト提出のお願い",
    "",
    `${params.staffName}さん`,
    "",
    `${params.shopName}\n${recruitmentRequest(params.periodLabel)}`,
    `提出期限：${params.deadline}`,
    "",
    SHIFT_SUBMISSION_CTA,
    withOpenExternalBrowser(params.magicLinkUrl),
    "",
    SHIFT_SUBMISSION_CORRECTION_NOTE,
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
    title: flexTitleWithShop(params.shopName, "📩 シフト提出のお願い"),
    body: [
      flexBodyText(`${params.staffName}さん`),
      flexBodyText(recruitmentRequest(params.periodLabel)),
      flexMetaText(`提出期限：${params.deadline}`),
      flexMutedText(SHIFT_SUBMISSION_CORRECTION_NOTE),
    ],
    cta: { label: SHIFT_SUBMISSION_CTA, uri: params.magicLinkUrl },
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
    `${params.shopName}\n${reissueMessage(params.periodLabel)}`,
    "",
    REISSUE_CTA,
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
    body: [flexBodyText(`${params.staffName}さん`), flexBodyText(reissueMessage(params.periodLabel))],
    cta: { label: REISSUE_CTA, uri: params.magicLinkUrl },
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
    "🔔 提出期限が近づいています",
    "",
    `${params.staffName}さん`,
    "",
    `${params.shopName}\n${SHIFT_SUBMISSION_REMINDER_PERIOD(params.periodLabel)}`,
    SHIFT_SUBMISSION_REMINDER_PENDING,
    `提出期限：${params.linkExpiresAtLabel}`,
    "",
    SHIFT_SUBMISSION_REMINDER_CTA,
    withOpenExternalBrowser(params.magicLinkUrl),
    "",
    SHIFT_SUBMISSION_CORRECTION_NOTE,
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
    title: flexTitleWithShop(params.shopName, "🔔 提出期限が近づいています"),
    body: [
      flexBodyText(`${params.staffName}さん`),
      flexBodyText(SHIFT_SUBMISSION_REMINDER_PERIOD(params.periodLabel)),
      flexBodyText(SHIFT_SUBMISSION_REMINDER_PENDING),
      flexMetaText(`提出期限：${params.linkExpiresAtLabel}`),
      flexMutedText(SHIFT_SUBMISSION_CORRECTION_NOTE),
    ],
    cta: { label: SHIFT_SUBMISSION_REMINDER_CTA, uri: params.magicLinkUrl },
  });
}

export function buildLineDefaultReplyText(): string {
  return [
    "シフトリの通知用アカウントです。",
    "シフトの確認や提出は、シフト作成担当者から届くメールまたはLINEのリンクから行ってください。",
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

function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeEmailHtmlWithLineBreaks(value: string): string {
  return escapeEmailHtml(value).replaceAll("\n", "<br />");
}

type EmailCtaVariant = "primary" | "billingPrimary" | "linePrimary";

function renderEmailCta(params: { label: string; url: string; variant: EmailCtaVariant }): string {
  const tableMargin = params.variant === "billingPrimary" ? "margin:8px 0 24px;" : "margin-bottom:24px;";
  const backgroundColor = params.variant === "linePrimary" ? "#06c755" : "#319795";
  return `<table width="100%" cellpadding="0" cellspacing="0" style="${tableMargin}">
            <tr><td align="center">
              <a href="${escapeEmailHtml(params.url)}" style="display:inline-block;padding:12px 32px;background-color:${backgroundColor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;" rel="noreferrer">${escapeEmailHtml(params.label)}</a>
            </td></tr>
          </table>`;
}

type EmailFooterVariant =
  | { kind: "managerNoReply" }
  | { kind: "staffQuestions" }
  | { kind: "staffQuestionsAndChanges" }
  | { kind: "staffReplyOnly" }
  | { kind: "lineInvite"; shopName: string };

function renderEmailFooter(footer: EmailFooterVariant): string {
  const separator = '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />';
  switch (footer.kind) {
    case "managerNoReply":
      return `${separator}
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールは送信専用です。<br />返信しても届きません。</p>`;
    case "staffQuestions":
      return `${separator}
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトに関する質問は、シフト作成担当者に連絡してください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>`;
    case "staffQuestionsAndChanges":
      return `${separator}
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトに関する質問や変更希望は、シフト作成担当者に連絡してください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>`;
    case "staffReplyOnly":
      return `${separator}
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>`;
    case "lineInvite":
      return `${separator}
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">${escapeEmailHtml(footer.shopName)}が利用しているシフト管理サービスです。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">このメールに返信しても、シフト作成担当者には届きません。</p>`;
  }
}

function renderBrandedEmail(params: { content: string; footer: EmailFooterVariant }): string {
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
          ${params.content}

          ${renderEmailFooter(params.footer)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

type OrganizationBillingEmailParams = {
  recipientName: string;
  organizationName: string;
  heading: string;
  headingSize?: "normal";
  paragraphs: readonly string[];
  action?: {
    label: string;
    url: string;
  };
};

export const ORGANIZATION_MANAGER_INVITATION_SUBJECT = "管理者として招待されました";
export const ORGANIZATION_MANAGER_INVITATION_ACCEPTED_SUBJECT = "管理者アカウント連携が完了しました";
export const ORGANIZATION_MANAGER_INVITATION_ACCEPTED_HEADING = "管理者アカウント連携が完了しました。";
export const ORGANIZATION_MANAGER_INVITATION_ACCEPTED_CTA = "シフトリを確認する";

type OrganizationManagerInvitationEmailParams = {
  recipientName: string;
  organizationName: string;
  inviterName: string;
  appUrl: string;
  helpUrl: string;
  invitationUrl: string;
};

export function buildOrganizationManagerInvitationLineText(params: {
  organizationName: string;
  invitationUrl: string;
}): string {
  return [
    `${params.organizationName}の管理者として招待されました。`,
    "ログインして、アカウント連携を完了してください。",
    withOpenExternalBrowser(params.invitationUrl),
  ].join("\n");
}

/**
 * 管理者招待の本文。invitationUrlはprovider呼び出し直前にactionのメモリ内で生成する。
 */
export function buildOrganizationManagerInvitationEmailHtml(params: OrganizationManagerInvitationEmailParams): string {
  const recipientName = escapeEmailHtml(params.recipientName);
  const organizationName = escapeEmailHtml(params.organizationName);
  const inviterName = escapeEmailHtml(params.inviterName);
  const helpUrl = escapeEmailHtml(params.helpUrl);

  return renderBrandedEmail({
    content: `<p style="margin:0 0 16px;font-size:15px;color:#1a202c;">${recipientName}さん</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">${organizationName}の${inviterName}さんから、管理者として招待されました。</p>
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1a202c;">1. シフトリとは？</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">スタッフの希望収集からシフト作成・共有までを支えるシフト管理サービスです。</p>

          ${renderEmailCta({ label: "シフトリを見る", url: params.appUrl, variant: "primary" })}

          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1a202c;">2. 管理者になるとできること</p>
          <ul style="margin:0 0 24px;padding-left:24px;font-size:15px;color:#1a202c;">
            <li style="margin:0 0 8px;">希望シフトの募集</li>
            <li style="margin:0 0 8px;">シフトの調整</li>
            <li style="margin:0 0 8px;">シフトの確定</li>
            <li style="margin:0 0 8px;">スタッフ管理</li>
            <li>店舗作成など</li>
          </ul>

          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1a202c;">3. シフトリの管理者になる操作手順</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">管理者になるためには、アカウント登録が必要です。</p>
          <ol style="margin:0 0 24px;padding-left:24px;font-size:15px;color:#1a202c;">
            <li style="margin:0 0 8px;">「シフトリの管理者招待を受け取る」ボタンを押す</li>
            <li>シフトリでアカウントを作成する<br />（すでにお持ちの場合はログインする）</li>
          </ol>

          ${renderEmailCta({
            label: "シフトリの管理者招待を受け取る",
            url: params.invitationUrl,
            variant: "primary",
          })}

          <p style="margin:0 0 16px;font-size:13px;color:#718096;">このリンクは7日間有効です。</p>
          <p style="margin:0 0 8px;font-size:15px;color:#1a202c;">気になる使い方は、シフトリのヘルプページをご確認ください。</p>
          <p style="margin:0 0 24px;font-size:15px;"><a href="${helpUrl}" style="color:#2c7a7b;text-decoration:underline;" rel="noreferrer">シフトリのヘルプページを見る</a></p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">心当たりがない場合は、このメールを破棄してください。</p>`,
    footer: { kind: "managerNoReply" },
  });
}

/**
 * 課金状態ごとの事実と次の操作を、安全なplain textから組み立てる共通メール。
 * 外部入力をHTMLとして受け取らず、各通知のaction側で件名と本文の業務事実を決める。
 */
export function buildOrganizationBillingEmailHtml(params: OrganizationBillingEmailParams): string {
  const recipientName = escapeEmailHtml(params.recipientName);
  const organizationName = escapeEmailHtml(params.organizationName);
  const heading = escapeEmailHtml(params.heading);
  const headingFontSize = params.headingSize === "normal" ? "15px" : "18px";
  const paragraphs = params.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;color:#1a202c;">${escapeEmailHtmlWithLineBreaks(paragraph)}</p>`,
    )
    .join("");
  const action = params.action
    ? renderEmailCta({ label: params.action.label, url: params.action.url, variant: "billingPrimary" })
    : "";

  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${recipientName}さん</p>
          <p style="margin:0 0 8px;font-size:13px;color:#718096;">${organizationName}</p>
          <p style="margin:0 0 24px;font-size:${headingFontSize};font-weight:700;color:#1a202c;">${heading}</p>
          ${paragraphs}
          ${action}`,
    footer: { kind: "managerNoReply" },
  });
}

function shiftRow(shift: ShiftEntry): string {
  const timeLabel = shiftTimeLabel(shift);
  const date = escapeEmailHtml(shift.date);
  if (timeLabel) {
    const timeLabelColor = timeLabel === "定休日" ? CLOSED_DAY_COLOR : "#1a202c";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a202c;">${date}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:${timeLabelColor};">${escapeEmailHtml(timeLabel)}</td>
    </tr>`;
  }
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#a0aec0;">${date}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#a0aec0;">休み</td>
  </tr>`;
}

export function buildConfirmationEmailHtml(params: ConfirmationEmailParams): string {
  const shiftRows = params.shifts.map(shiftRow).join("");
  const staffName = escapeEmailHtml(params.staffName);
  const periodLabel = escapeEmailHtml(params.periodLabel);
  const reissueUrl = escapeEmailHtml(params.reissueUrl);
  const bodyMessage = params.isResend
    ? `${periodLabel}のシフトに変更がありました。<br />最新のシフトを確認してください。`
    : `${periodLabel}のシフトが確定しました。`;

  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${staffName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${bodyMessage}</p>

          <!-- Shift Table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td colspan="2" style="padding:10px 12px;background-color:#f7fafc;font-size:13px;font-weight:600;color:#4a5568;border-bottom:1px solid #e2e8f0;">あなたのシフト</td></tr>
            ${shiftRows}
          </table>

          <!-- CTA Button -->
          ${renderEmailCta({ label: SHIFT_CONFIRMATION_CTA, url: params.magicLinkUrl, variant: "primary" })}

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">このリンクは24時間有効です。</p>
          <p style="margin:0 0 8px;font-size:13px;color:#718096;">${ALL_SHIFTS_VIEWING_PERIOD}</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">期限切れの場合は<a href="${reissueUrl}" style="color:#319795;" rel="noreferrer">こちら</a>から再発行できます。</p>

          ${params.lineCtaHtml ?? ""}`,
    footer: { kind: "staffQuestionsAndChanges" },
  });
}

type RecruitmentEmailParams = {
  staffName: string;
  periodLabel: string;
  deadline: string; // フォーマット済み（例: "1/17(金)"）
  magicLinkUrl: string;
  lineCtaHtml?: string;
};

export function buildRecruitmentEmailHtml(params: RecruitmentEmailParams): string {
  const staffName = escapeEmailHtml(params.staffName);
  const periodLabel = escapeEmailHtml(params.periodLabel);
  const deadline = escapeEmailHtml(params.deadline);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${staffName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${recruitmentRequest(periodLabel)}</p>

          <!-- Deadline -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;background-color:#f7fafc;font-size:14px;color:#1a202c;">
              <strong>提出期限：</strong> ${deadline}
            </td></tr>
          </table>

          <!-- CTA Button -->
          ${renderEmailCta({ label: SHIFT_SUBMISSION_CTA, url: params.magicLinkUrl, variant: "primary" })}

          <p style="margin:0 0 24px;font-size:13px;color:#718096;">${SHIFT_SUBMISSION_CORRECTION_NOTE}</p>

          ${params.lineCtaHtml ?? ""}`,
    footer: { kind: "staffQuestions" },
  });
}

type ReminderEmailParams = {
  staffName: string;
  periodLabel: string;
  linkExpiresAtLabel: string; // フォーマット済み（例: "5/6(月)"）
  magicLinkUrl: string;
  lineCtaHtml?: string;
};

export function buildReminderEmailHtml(params: ReminderEmailParams): string {
  const staffName = escapeEmailHtml(params.staffName);
  const periodLabel = escapeEmailHtml(params.periodLabel);
  const linkExpiresAtLabel = escapeEmailHtml(params.linkExpiresAtLabel);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${staffName}さん</p>
          <p style="margin:0 0 8px;font-size:15px;color:#1a202c;">${SHIFT_SUBMISSION_REMINDER_PERIOD(periodLabel)}</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${SHIFT_SUBMISSION_REMINDER_PENDING}</p>

          <!-- Deadline -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;background-color:#f7fafc;font-size:14px;color:#1a202c;">
              <strong>提出期限：</strong> ${linkExpiresAtLabel}
            </td></tr>
          </table>

          <!-- CTA Button -->
          ${renderEmailCta({ label: SHIFT_SUBMISSION_REMINDER_CTA, url: params.magicLinkUrl, variant: "primary" })}

          <p style="margin:0 0 24px;font-size:13px;color:#718096;">${SHIFT_SUBMISSION_CORRECTION_NOTE}</p>

          ${params.lineCtaHtml ?? ""}`,
    footer: { kind: "staffQuestions" },
  });
}

type LineInviteEmailParams = {
  staffName: string;
  shopName: string;
  authorizeUrl: string;
  context?: "default" | "registration_approved";
};

const LINE_INVITE_LEAD = "シフトのお知らせをLINEで受け取れます。";
const LINE_INVITE_DESCRIPTION =
  "下記ボタンからLINEと連携してください。\nメールで受け取りを希望される場合は、無視してください。";
const LINE_INVITE_LINK_EXPIRY = "LINE連携リンクは72時間有効です。";
const LINE_INVITE_EXPIRED = "シフト作成担当者に連絡してください。";
const LINE_CTA_NOTE = "シフトのお知らせをLINEでも受け取れます。";

export function buildLineInviteEmailHtml(params: LineInviteEmailParams): string {
  const staffName = escapeEmailHtml(params.staffName);
  const lead = escapeEmailHtmlWithLineBreaks(
    [...(params.context === "registration_approved" ? ["スタッフ登録が承認されました。"] : []), LINE_INVITE_LEAD].join(
      "\n",
    ),
  );
  const description = escapeEmailHtmlWithLineBreaks(LINE_INVITE_DESCRIPTION);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${staffName}さん</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">${lead}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#4a5568;">${description}</p>

          ${renderEmailCta({ label: "LINE連携する", url: params.authorizeUrl, variant: "linePrimary" })}

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">${LINE_INVITE_LINK_EXPIRY}</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">${LINE_INVITE_EXPIRED}</p>`,
    footer: { kind: "lineInvite", shopName: params.shopName },
  });
}

/**
 * 既存通知メール末尾の「LINEで受け取る」CTA セクション
 * - 未連携 / 友達解除済みのスタッフのみに表示する想定（呼び出し側で判定）
 * - 返却する完成HTMLは、通知テンプレートのlineCtaHtmlへ内部経路からだけ渡す
 */
export function buildLineCtaSection(params: { authorizeUrl: string; reLink: boolean }): string {
  const authorizeUrl = escapeEmailHtml(params.authorizeUrl);
  const label = params.reLink ? "LINEを再連携する" : "LINE連携する";
  const note = escapeEmailHtmlWithLineBreaks(
    params.reLink
      ? "シフトリ公式アカウントの友だち追加が解除されています。\nLINE通知を受け取るには、友達してください。"
      : LINE_CTA_NOTE,
  );
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-top:1px solid #e2e8f0;padding-top:24px;">
    <tr><td>
      <p style="margin:0 0 12px;font-size:13px;color:#4a5568;">${note}</p>
    </td></tr>
    <tr><td align="center">
      <a href="${authorizeUrl}" style="display:inline-block;padding:10px 24px;background-color:#06c755;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;" rel="noreferrer">${label}</a>
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
    STAFF_REGISTRATION_OWNER_MESSAGE,
    STAFF_REGISTRATION_OWNER_DETAIL,
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
    body: [flexBodyText(STAFF_REGISTRATION_OWNER_MESSAGE), flexBodyText(STAFF_REGISTRATION_OWNER_DETAIL)],
    cta: { label: STAFF_REGISTRATION_OWNER_CTA, uri: params.dashboardUrl },
  });
}

export function buildStaffRegistrationOwnerDigestEmailHtml(
  params: StaffRegistrationOwnerDigestParams & { managerName: string },
): string {
  const managerName = escapeEmailHtml(params.managerName);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${managerName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${STAFF_REGISTRATION_OWNER_MESSAGE}<br />${STAFF_REGISTRATION_OWNER_DETAIL}</p>

          ${renderEmailCta({ label: STAFF_REGISTRATION_OWNER_CTA, url: params.dashboardUrl, variant: "primary" })}`,
    footer: { kind: "managerNoReply" },
  });
}

export const NOTIFICATION_FAILURE_REMINDER_SUBJECT = "送れなかった通知があります";

const NOTIFICATION_FAILURE_TITLE = "⚠️ 一部通知に失敗";
const NOTIFICATION_FAILURE_STAFF_MESSAGE = "正常に送信できなかった通知があります。";
const NOTIFICATION_FAILURE_DETAIL = "詳細はシフトリを確認してください。";
const NOTIFICATION_FAILURE_CTA = SHIFTORI_CONFIRMATION_CTA;

type NotificationFailureReminderParams = {
  dashboardUrl: string;
};

export function buildNotificationFailureReminderLineText(params: NotificationFailureReminderParams): string {
  return [
    NOTIFICATION_FAILURE_TITLE,
    "",
    NOTIFICATION_FAILURE_STAFF_MESSAGE,
    NOTIFICATION_FAILURE_DETAIL,
    "",
    withOpenExternalBrowser(params.dashboardUrl),
  ].join("\n");
}

export function buildNotificationFailureReminderLineFlexMessage(
  params: NotificationFailureReminderParams & { shopName: string },
): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildNotificationFailureReminderLineText(params),
    title: flexTitleWithShop(params.shopName, NOTIFICATION_FAILURE_TITLE),
    body: [flexBodyText(NOTIFICATION_FAILURE_STAFF_MESSAGE), flexBodyText(NOTIFICATION_FAILURE_DETAIL)],
    cta: { label: NOTIFICATION_FAILURE_CTA, uri: params.dashboardUrl },
  });
}

export function buildNotificationFailureReminderEmailHtml(
  params: NotificationFailureReminderParams & { managerName: string },
): string {
  const managerName = escapeEmailHtml(params.managerName);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${managerName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${NOTIFICATION_FAILURE_STAFF_MESSAGE}<br />${NOTIFICATION_FAILURE_DETAIL}</p>

          ${renderEmailCta({ label: NOTIFICATION_FAILURE_CTA, url: params.dashboardUrl, variant: "primary" })}`,
    footer: { kind: "managerNoReply" },
  });
}

export const SHOP_ACTIVATION_REMINDER_SUBJECT = "最初のシフト募集をつくりましょう";

type ShopActivationReminderParams = {
  dashboardUrl: string;
};

export function buildShopActivationReminderLineText(params: ShopActivationReminderParams): string {
  return [
    "📅 シフト作成の続き",
    "",
    SHOP_ACTIVATION_PERIOD,
    "",
    SHOP_ACTIVATION_ACTION,
    "",
    SHOP_ACTIVATION_CTA,
    withOpenExternalBrowser(params.dashboardUrl),
  ].join("\n");
}

export function buildShopActivationReminderLineFlexMessage(
  params: ShopActivationReminderParams & { shopName: string },
): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildShopActivationReminderLineText(params),
    title: flexTitleWithShop(params.shopName, "📅 シフト作成の続き"),
    body: [flexBodyText(SHOP_ACTIVATION_PERIOD), flexBodyText(SHOP_ACTIVATION_ACTION)],
    cta: { label: SHOP_ACTIVATION_CTA, uri: params.dashboardUrl },
  });
}

export function buildShopActivationReminderEmailHtml(
  params: ShopActivationReminderParams & { managerName: string },
): string {
  const managerName = escapeEmailHtml(params.managerName);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${managerName}さん</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">${SHOP_ACTIVATION_PERIOD}</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${SHOP_ACTIVATION_ACTION}</p>

          ${renderEmailCta({ label: SHOP_ACTIVATION_CTA, url: params.dashboardUrl, variant: "primary" })}`,
    footer: { kind: "managerNoReply" },
  });
}

export const SHIFT_CONFIRMATION_REMINDER_SUBJECT = "シフトの確定をお願いします";

type ShiftConfirmationReminderParams = {
  periodLabel: string;
  deadlineLabel: string; // フォーマット済み（例: "1/17(金) 23:59"）
  dashboardUrl: string;
};

export function buildShiftConfirmationReminderLineText(params: ShiftConfirmationReminderParams): string {
  return [
    "⏰ 提出期限を過ぎています",
    "",
    SHIFT_CONFIRMATION_REMINDER_PERIOD(params.periodLabel),
    `提出期限（${params.deadlineLabel}）を過ぎています。`,
    SHIFT_CONFIRMATION_REMINDER_ACTION,
    "",
    SHIFTORI_CONFIRMATION_CTA,
    withOpenExternalBrowser(params.dashboardUrl),
  ].join("\n");
}

export function buildShiftConfirmationReminderLineFlexMessage(
  params: ShiftConfirmationReminderParams & { shopName: string },
): NotificationLineFlexMessage {
  return buildFlexMessage({
    altText: buildShiftConfirmationReminderLineText(params),
    title: flexTitleWithShop(params.shopName, "⏰ 提出期限を過ぎています"),
    body: [
      flexBodyText(SHIFT_CONFIRMATION_REMINDER_PERIOD(params.periodLabel)),
      flexMetaText(`提出期限（${params.deadlineLabel}）を過ぎています。`),
      flexBodyText(SHIFT_CONFIRMATION_REMINDER_ACTION),
    ],
    cta: { label: SHIFTORI_CONFIRMATION_CTA, uri: params.dashboardUrl },
  });
}

export function buildShiftConfirmationReminderEmailHtml(
  params: ShiftConfirmationReminderParams & { managerName: string },
): string {
  const managerName = escapeEmailHtml(params.managerName);
  const periodLabel = escapeEmailHtml(params.periodLabel);
  const deadlineLabel = escapeEmailHtml(params.deadlineLabel);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${managerName}さん</p>
          <p style="margin:0 0 8px;font-size:15px;color:#1a202c;">${SHIFT_CONFIRMATION_REMINDER_PERIOD(periodLabel)}</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${SHIFT_CONFIRMATION_REMINDER_ACTION}</p>

          <!-- Deadline -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="padding:12px 16px;background-color:#f7fafc;font-size:14px;color:#1a202c;">
              <strong>提出期限：</strong> ${deadlineLabel}（期限超過）
            </td></tr>
          </table>

          <!-- CTA Button -->
          ${renderEmailCta({ label: SHIFTORI_CONFIRMATION_CTA, url: params.dashboardUrl, variant: "primary" })}`,
    footer: { kind: "managerNoReply" },
  });
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
  const staffName = escapeEmailHtml(params.staffName);
  const shopName = escapeEmailHtml(params.shopName);
  const expiresAtLabel = escapeEmailHtml(formatDateTimeJa(params.expiresAt));
  const usageText = staffLegalConsentUsage(shopName);
  const expiryText = staffLegalConsentExpiry(expiresAtLabel);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 20px;font-size:15px;color:#1a202c;">${staffName}さん</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a202c;">${usageText}</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${STAFF_LEGAL_CONSENT_DETAIL}</p>

          ${renderEmailCta({ label: STAFF_LEGAL_CONSENT_CTA, url: params.consentUrl, variant: "primary" })}

          <p style="margin:0 0 24px;font-size:13px;color:#718096;">${expiryText}</p>`,
    footer: { kind: "staffReplyOnly" },
  });
}

export function buildStaffLegalConsentLineText(params: {
  staffName: string;
  shopName: string;
  consentUrl: string;
  expiresAt: number;
}): string {
  return [
    `📄 ${STAFF_LEGAL_CONSENT_SUBJECT}`,
    "",
    `${params.staffName}さん`,
    "",
    staffLegalConsentUsage(params.shopName),
    STAFF_LEGAL_CONSENT_DETAIL,
    "",
    STAFF_LEGAL_CONSENT_CTA,
    withOpenExternalBrowser(params.consentUrl),
    "",
    staffLegalConsentExpiry(formatDateTimeJa(params.expiresAt)),
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
    title: flexTitleWithShop(params.shopName, `📄 ${STAFF_LEGAL_CONSENT_SUBJECT}`),
    body: [
      flexBodyText(`${params.staffName}さん`),
      flexBodyText(staffLegalConsentUsage(params.shopName)),
      flexBodyText(STAFF_LEGAL_CONSENT_DETAIL),
      flexMetaText(staffLegalConsentExpiry(formatDateTimeJa(params.expiresAt))),
    ],
    cta: { label: STAFF_LEGAL_CONSENT_CTA, uri: params.consentUrl },
  });
}

export function buildReissueEmailHtml(params: ReissueEmailParams): string {
  const staffName = escapeEmailHtml(params.staffName);
  const periodLabel = escapeEmailHtml(params.periodLabel);
  return renderBrandedEmail({
    content: `<p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${staffName}さん</p>
          <p style="margin:0 0 24px;font-size:15px;color:#1a202c;">${reissueMessage(periodLabel)}</p>

          <!-- CTA Button -->
          ${renderEmailCta({ label: REISSUE_CTA, url: params.magicLinkUrl, variant: "primary" })}

          <p style="margin:0 0 24px;font-size:13px;color:#718096;">このリンクは24時間有効です。<br />${ALL_SHIFTS_VIEWING_PERIOD}</p>`,
    footer: { kind: "staffQuestionsAndChanges" },
  });
}
