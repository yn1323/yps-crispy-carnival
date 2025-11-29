import { Box, Spinner } from "@chakra-ui/react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { Navigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { userAtom } from "@/src/stores/user";

type Props = {
  children: React.ReactNode;
};
export const AuthGuard = ({ children }: Props) => {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const { user: clerkUser } = useUser();
  const [user, setUser] = useAtom(userAtom);
  const [isCreating, setIsCreating] = useState(false);

  const userData = useQuery(api.user.queries.getByAuthId, userId ? { authId: userId } : "skip");
  const getOrCreateUser = useMutation(api.user.mutations.getOrCreate);

  const isConvexLoading = userData === undefined;

  // 新規ユーザーの自動作成
  useEffect(() => {
    const createUserIfNeeded = async () => {
      if (isSignedIn && userId && userData === null && !isCreating) {
        setIsCreating(true);
        const name = clerkUser?.fullName || clerkUser?.firstName || "新規ユーザー";
        const newUser = await getOrCreateUser({ authId: userId, name });
        if (newUser?.authId) {
          setUser({
            name: newUser.name,
            authId: newUser.authId,
          });
        }
        setIsCreating(false);
      }
    };
    createUserIfNeeded();
  }, [isSignedIn, userId, userData, isCreating, clerkUser, getOrCreateUser, setUser]);

  // ユーザーが状態管理にいれば即返却
  if (user.authId) {
    return children;
  }

  // Clerk & Convexがローディング中、または新規ユーザー作成中
  const isLoading = !isLoaded || isConvexLoading || isCreating;
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

  // 既存ユーザーの場合、状態に保存
  if (userData?.authId) {
    setUser({
      name: userData.name,
      authId: userData.authId,
    });
  }

  return children;
};
