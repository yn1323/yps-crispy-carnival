import { getClerkErrorMessage } from "@/src/components/features/AuthPage/errorPresentation";

const IDENTIFIER_COLLISION_MESSAGE = "このメールアドレスに変更できません。\n別のメールアドレスを入力してください。";

/** account管理では、別Userの識別子登録状態を推測できない文言へ揃える。 */
export function getLoginMethodAccountErrorMessage(error: unknown): string {
  return isEmailIdentifierCollision(error) ? IDENTIFIER_COLLISION_MESSAGE : getClerkErrorMessage(error);
}

function isEmailIdentifierCollision(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const firstError = "errors" in error && Array.isArray(error.errors) ? error.errors[0] : error;
  if (!firstError || typeof firstError !== "object" || !("code" in firstError)) return false;
  const code = typeof firstError.code === "string" ? firstError.code : "";
  return (
    code === "form_identifier_exists" ||
    code === "identifier_exists" ||
    code === "form_identifier_already_exists" ||
    code === "email_address_exists" ||
    code === "email_address_taken" ||
    (code.includes("identifier") && (code.includes("exists") || code.includes("already") || code.includes("taken")))
  );
}
