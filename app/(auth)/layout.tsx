import { Box } from "@chakra-ui/react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { SideMenu } from "@/src/components/layout/SideMenu";
import { convex } from "@/src/configs/convex";
import { addRegisterInfo } from "@/src/helpers/auth/registerUser";

// キャッシュ化されたユーザープロフィール取得関数
const getCachedUserProfile = async (authId: string) => {
  try {
    const user = await convex.query(api.auth.getUserByAuthId, {
      authId,
    });
    return !!user?.hasProfile;
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return false;
  }
};

const AuthLayout = async ({ children }: { children: React.ReactNode }) => {
  const { userId } = await auth();
  const user = await currentUser();
  let isRegistered = !!user?.publicMetadata?.isRegistered;

  // 未認証の場合はログアウトページへ
  if (!userId) {
    redirect("/logout");
  }

  // metaData hasProfileがない場合はキャッシュされたDBクエリで取得
  if (!isRegistered) {
    isRegistered = await getCachedUserProfile(userId);
    addRegisterInfo({ userId, isRegistered });
  }

  // プロフィール未完了の場合は登録ページへ(Middlewareで実施)
  return (
    <Box display="flex">
      <SideMenu />
      <Box ml="250px" flex={1}>
        {children}
      </Box>
    </Box>
  );
};

export default AuthLayout;
