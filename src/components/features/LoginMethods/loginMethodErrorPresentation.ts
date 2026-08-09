import { getClerkErrorMessage } from "@/src/components/features/AuthPage/errorPresentation";

const IDENTIFIER_COLLISION_MESSAGE = "このメールアドレスに変更できません。\n別のメールアドレスを入力してください。";

/** account管理では、別Userの識別子登録状態を推測できない文言へ揃える。 */
export function getLoginMethodAccountErrorMessage(error: unknown): string {
  return isEmailIdentifierCollision(error) ? IDENTIFIER_COLLISION_MESSAGE : getClerkErrorMessage(error);
}

export function getPasswordChangeErrorMessage(error: unknown): string {
  switch (getClerkErrorCode(error)) {
    case "form_password_incorrect":
    case "form_password_or_identifier_incorrect":
      return "現在のパスワードが正しくありません。\n入力内容を確認してください。";
    case "form_password_length_too_short":
      return "新しいパスワードは8文字以上で入力してください。";
    case "form_password_pwned":
    case "form_password_compromised":
      return "このパスワードは安全性に問題があります。\n別のパスワードを設定してください。";
    case "too_many_requests":
      return "試行回数が多すぎます。\n時間をおいて、もう一度お試しください。";
    default:
      return "パスワードを変更できませんでした。\n入力内容を確認して、もう一度お試しください。";
  }
}

export function emailVerificationCooldownMessage(retryAfterSeconds: number) {
  return `確認コードを送信した直後です。あと${retryAfterSeconds}秒ほど待ってから再送してください。`;
}

function isEmailIdentifierCollision(error: unknown) {
  const code = getClerkErrorCode(error);
  return (
    code === "form_identifier_exists" ||
    code === "identifier_exists" ||
    code === "form_identifier_already_exists" ||
    code === "email_address_exists" ||
    code === "email_address_taken" ||
    (code.includes("identifier") && (code.includes("exists") || code.includes("already") || code.includes("taken")))
  );
}

function getClerkErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const firstError = "errors" in error && Array.isArray(error.errors) ? error.errors[0] : error;
  if (!firstError || typeof firstError !== "object" || !("code" in firstError)) return "";
  return typeof firstError.code === "string" ? firstError.code : "";
}
