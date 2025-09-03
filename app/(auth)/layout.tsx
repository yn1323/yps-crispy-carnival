import { Box } from "@chakra-ui/react";
import { SideMenu } from "@/src/components/layout/SideMenu";

const AuthLayout = async ({ children }: { children: React.ReactNode }) => {
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
