import type { ContactDeliveryInput } from "./schemas";
import { getContactTypeLabel } from "./schemas";

export function buildContactEmailSubject(type: ContactDeliveryInput["type"]): string {
  return `【シフトリ】${getContactTypeLabel(type)}の問い合わせ`;
}

export function buildContactEmailText(input: ContactDeliveryInput): string {
  return [
    `問い合わせ種別: ${getContactTypeLabel(input.type)}`,
    `氏名: ${input.name}`,
    `メールアドレス: ${input.email}`,
    `店舗名または会社名: ${input.organization || "未入力"}`,
    `リクエストID: ${input.requestId}`,
    "",
    "問い合わせ内容:",
    input.message,
  ].join("\n");
}
