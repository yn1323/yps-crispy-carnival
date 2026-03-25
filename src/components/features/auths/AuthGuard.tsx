import { Box, Spinner } from "@chakra-ui/react";
import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { userAtom } from "@/src/stores/user";

type Props = {
  children: React.ReactNode;
};

export const AuthGuard = ({ children }: Props) => {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const [user, setUser] = useAtom(userAtom);

  // ユーザーが状態管理にいれば即返却
  if (user.authId) {
    return children;
  }

  // Clerkがローディング中
  if (!isLoaded) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Spinner />
      </Box>
    );
  }

  // 未認証の場合、TOPにリダイレクト
  if (!isSignedIn) {
    return <Navigate to="/" />;
  }

  // TODO: v3ではConvexスキーマ再構築後にユーザー取得を復活させる
  if (userId) {
    setUser({
      name: "",
      authId: userId,
      email: "",
    });
  }

  return children;
};
