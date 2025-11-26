import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlreadyAccepted, ErrorView, Loading, LoggedIn, RequireLogin } from "@/src/components/features/User/Join";

type Props = {
  token: string;
};

export const InvitePage = ({ token }: Props) => {
  const { isSignedIn } = useAuth();
  const invitation = useQuery(api.invite.getInvitationByToken, token ? { token } : "skip");

  // トークンがない場合
  if (!token) {
    return <ErrorView title="無効なリンク" message="招待リンクが正しくありません。" />;
  }

  // ローディング中
  if (invitation === undefined) {
    return <Loading />;
  }

  // 招待が見つからない
  if (!invitation) {
    return <ErrorView title="招待が見つかりません" message="この招待リンクは無効か、既にキャンセルされています。" />;
  }

  // 期限切れ
  if (invitation.isExpired) {
    return (
      <ErrorView
        title="招待の有効期限切れ"
        message="この招待リンクの有効期限が切れています。"
        subMessage="招待者に再送をお願いしてください。"
        iconColor="orange.400"
      />
    );
  }

  // キャンセル済み
  if (invitation.isCancelled) {
    return <ErrorView title="招待がキャンセルされました" message="この招待はキャンセルされています。" />;
  }

  // 既に承認済み
  if (invitation.isAccepted) {
    return <AlreadyAccepted />;
  }

  // ログインが必要
  if (!isSignedIn) {
    return <RequireLogin />;
  }

  // ログイン済み - 正常系（useMutationはLoggedIn内で管理）
  return <LoggedIn invitation={invitation} token={token} />;
};
