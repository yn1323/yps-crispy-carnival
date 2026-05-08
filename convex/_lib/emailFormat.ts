const APP_NAME = "シフトリ";

export function formatResendFrom(shopName: string, fromEmail: string): string {
  return `【${APP_NAME}】${shopName} <${fromEmail}>`;
}

export function formatResendSubject(shopName: string, subject: string): string {
  return `【${APP_NAME}：${shopName}】${subject}`;
}
