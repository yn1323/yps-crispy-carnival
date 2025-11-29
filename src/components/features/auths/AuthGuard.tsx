import { Box, Spinner } from "@chakra-ui/react";
import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { api } from "@/convex/_generated/api";
import { userAtom } from "@/src/stores/user";

type Props = {
  children: React.ReactNode;
};
export const AuthGuard = ({ children }: Props) => {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const [user, setUser] = useAtom(userAtom);
  const userData = useQuery(api.user.queries.getByAuthId, userId ? { authId: userId } : "skip");
  const isConvexLoading = userData === undefined;

  // ユーザーが状態管理にいれば即返却
  if (user.authId) {
    return children;
  }

  // Clerk & Convexがローディング中
  const isLoading = !isLoaded || isConvexLoading;
  if (isLoading) {
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

  if (userData?.authId) {
    setUser({
      name: userData.name,
      authId: userData.authId,
      email: userData.email ?? "",
    });
  }

  // 初回登録がまだの場合
  if (isSignedIn && (!user.name || !userData)) {
    return <Navigate to="/welcome" replace />;
  }

  return children;
};
