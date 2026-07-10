const DEFAULT_ERROR_MESSAGE = "うまく処理できませんでした";

const ERROR_MESSAGE_MAP: Readonly<Record<string, string>> = {
  "not found": "対象のデータが見つかりません。画面を再読み込みしてください。",
  unauthenticated: "ログインの有効期限が切れました。もう一度ログインしてください。",
  "session expired": "操作の有効期限が切れました。画面を再読み込みしてください。",
};

/** 内部向けの英語エラーを画面へ露出させず、利用者が次に取れる行動へ置き換える。 */
export function getUserFacingErrorMessage(message: string | undefined): string {
  const normalized = message?.trim();
  if (!normalized) return DEFAULT_ERROR_MESSAGE;

  const mappedMessage = ERROR_MESSAGE_MAP[normalized.toLowerCase()];
  if (mappedMessage) return mappedMessage;

  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(normalized)
    ? normalized
    : DEFAULT_ERROR_MESSAGE;
}
