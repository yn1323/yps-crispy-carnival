import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  Accepted,
  AlreadyAccepted,
  ErrorView,
  Loading,
  LoggedIn,
  RequireLogin,
} from "@/src/components/features/User/Join";

type Props = {
  token: string;
};

export const InvitePage = ({ token }: Props) => {
  const { isSignedIn, userId } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedShopId, setAcceptedShopId] = useState<string | null>(null);
  const [acceptedShopName, setAcceptedShopName] = useState<string | null>(null);

  const invitation = useQuery(api.invite.getInvitationByToken, token ? { token } : "skip");
  const acceptInvitation = useMutation(api.invite.acceptInvitation);

  // 承認処理
  const handleAccept = async () => {
    if (!userId) return;

    setIsAccepting(true);
    setError(null);

    try {
      const result = await acceptInvitation({
        token,
        authId: userId,
      });

      if (result.success) {
        setIsAccepted(true);
        setAcceptedShopId(result.data.shopId);
        setAcceptedShopName(result.data.shopName);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "参加処理に失敗しました");
    } finally {
      setIsAccepting(false);
    }
  };

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

  // 承認完了後の表示
  if (isAccepted && acceptedShopId && acceptedShopName) {
    return <Accepted shopId={acceptedShopId} shopName={acceptedShopName} />;
  }

  // ログインが必要
  if (!isSignedIn) {
    return <RequireLogin invitation={invitation} />;
  }

  // ログイン済み - 正常系
  return <LoggedIn invitation={invitation} error={error} isAccepting={isAccepting} onAccept={handleAccept} />;
};
