const DEFAULT_ERROR_MESSAGE = "うまく処理できませんでした";

const ERROR_MESSAGE_MAP: Readonly<Record<string, string>> = {
  "not found": "対象のデータが見つかりません。画面を再読み込みしてください。",
  unauthenticated: "ログインの有効期限が切れました。もう一度ログインしてください。",
  "session expired": "操作の有効期限が切れました。画面を再読み込みしてください。",
};

export function getUserFacingErrorMessage(message: string | undefined): string {
  const normalized = message?.trim();
  if (!normalized) return DEFAULT_ERROR_MESSAGE;

  const mappedMessage = ERROR_MESSAGE_MAP[normalized.toLowerCase()];
  if (mappedMessage) return mappedMessage;

  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(normalized)
    ? normalized
    : DEFAULT_ERROR_MESSAGE;
}
