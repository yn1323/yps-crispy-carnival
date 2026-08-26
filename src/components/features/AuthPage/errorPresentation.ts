type ClerkError = {
  code?: string;
  message?: string;
  longMessage?: string;
};

export function getClerkErrorMessage(error: unknown) {
  const clerkError = getFirstClerkError(error);
  if (!clerkError) return "認証に失敗しました。\n時間をおいて、もう一度お試しください。";

  switch (clerkError.code) {
    case "form_identifier_not_found":
      return "このメールアドレスのアカウントが見つかりません。";
    case "form_password_incorrect":
    case "form_password_or_identifier_incorrect":
      return "メールアドレスまたはパスワードが誤っています。";
    case "form_code_incorrect":
      return "確認コードが誤っています。";
    case "form_code_expired":
      return "確認コードの有効期限が切れています。\nもう一度お試しください。";
    case "form_password_length_too_short":
      return "パスワードは8文字以上で入力してください。";
    case "form_password_pwned":
    case "form_password_compromised":
      return "このパスワードは安全性に問題があります。\n別のパスワードを設定してください。";
    case "form_identifier_exists":
      return "このメールアドレスはすでに登録されています。\nログインをお試しください。";
    case "too_many_requests":
      return "試行回数が多すぎます。\n時間をおいて、もう一度お試しください。";
    default:
      return "認証に失敗しました。\n入力内容を確認してください。";
  }
}

function getFirstClerkError(error: unknown): ClerkError | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("errors" in error && Array.isArray(error.errors)) {
    return error.errors[0];
  }

  if ("code" in error || "message" in error) {
    return error as ClerkError;
  }

  return undefined;
}
