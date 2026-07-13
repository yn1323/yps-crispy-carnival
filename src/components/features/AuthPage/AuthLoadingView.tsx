import { AuthShell } from "./AuthShell";
import type { AuthMode } from "./types";

type AuthLoadingViewProps = {
  mode: AuthMode;
};

export function AuthLoadingView({ mode }: AuthLoadingViewProps) {
  const title =
    mode === "login" ? "シフトリにログイン" : mode === "signup" ? "シフトリをはじめる" : "パスワードを再設定";
  const description = mode === "forgot-password" ? "登録済みメールアドレスに再設定コードを送信します。" : undefined;

  return (
    <AuthShell title={title} description={description} isInitialLoading>
      {null}
    </AuthShell>
  );
}
