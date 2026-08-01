const DEFAULT_ERROR_MESSAGE = "操作を完了できませんでした。\n少し時間をおいて、もう一度お試しください。";

const INTERNAL_ERROR_PATTERN =
  /(?:clerk|convex|stripe|uncaught|exception|stack(?: trace)?|undefined|null|mutation|query|action|request[ _-]?id|内部|エラー|例外|スタックトレース|予期しない|想定外|一意に|リクエストID|人物情報|店舗人物|管理者所属)/iu;

const ERROR_MESSAGE_MAP: Readonly<Record<string, string>> = {
  "not found": "対象のデータが見つかりません。\n画面を再読み込みしてください。",
  unauthenticated: "ログインの有効期限が切れました。\nもう一度ログインしてください。",
  "session expired": "操作の有効期限が切れました。\n画面を再読み込みしてください。",
};

export function getUserFacingErrorMessage(message: string | undefined): string {
  const normalized = message?.trim();
  if (!normalized) return DEFAULT_ERROR_MESSAGE;

  const mappedMessage = ERROR_MESSAGE_MAP[normalized.toLowerCase()];
  if (mappedMessage) return mappedMessage;

  if (INTERNAL_ERROR_PATTERN.test(normalized)) return DEFAULT_ERROR_MESSAGE;

  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(normalized)
    ? normalized
    : DEFAULT_ERROR_MESSAGE;
}
