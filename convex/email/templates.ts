type ShiftEntry = {
  date: string;
  startTime: string | null;
  endTime: string | null;
};

type ConfirmationEmailParams = {
  staffName: string;
  periodLabel: string;
  shifts: ShiftEntry[];
  magicLinkUrl: string;
  reissueUrl: string;
  isResend: boolean;
};

type ReissueEmailParams = {
  staffName: string;
  periodLabel: string;
  magicLinkUrl: string;
};

function shiftRow(shift: ShiftEntry): string {
  if (shift.startTime && shift.endTime) {
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a202c;">${shift.date}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1a202c;">${shift.startTime} - ${shift.endTime}</td>
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
          <span style="color:#ffffff;font-size:16px;font-weight:700;">YPS</span>
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

          <!-- Footer -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問・変更希望はお店に直接ご連絡ください。</p>
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
          <span style="color:#ffffff;font-size:16px;font-weight:700;">YPS</span>
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

          <p style="margin:0 0 8px;font-size:13px;color:#718096;">このリンクは提出締切まで有効です。</p>
          <p style="margin:0 0 24px;font-size:13px;color:#718096;">提出後も締切前であれば修正できます。</p>

          <!-- Footer -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問はお店に直接ご連絡ください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">※ このメールに返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
          <span style="color:#ffffff;font-size:16px;font-weight:700;">YPS</span>
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
          <p style="margin:0 0 4px;font-size:12px;color:#a0aec0;">シフトについてのご質問・変更希望はお店に直接ご連絡ください。</p>
          <p style="margin:0;font-size:12px;color:#a0aec0;">※ このメールに返信しても届きません。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
