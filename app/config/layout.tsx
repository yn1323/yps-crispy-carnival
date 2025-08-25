import { Box } from "@chakra-ui/react";
import { SideMenu } from "@/src/components/layout/SideMenu";

export default async function ConfigLayout({ children }: { children: React.ReactNode }) {
  const userRegistered = true;

  if (!userRegistered) {
    // 未登録ユーザーの場合はサイドバーなしで表示
    return <Box>{children}</Box>;
  }

  // 登録済みユーザーの場合はサイドバー付きで表示
  return (
    <Box display="flex">
      <SideMenu />
      <Box ml="250px" flex={1}>
        {children}
      </Box>
    </Box>
  );
}
