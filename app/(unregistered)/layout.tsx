import { Box } from "@chakra-ui/react";
import { SideMenu } from "@/src/components/layout/SideMenu";

const AuthLayout = async ({ children }: { children: React.ReactNode }) => {
  return (
    <Box display="flex">
      <SideMenu onlyLogout />
      <Box ml="250px" flex={1}>
        {children}
      </Box>
    </Box>
  );
};

export default AuthLayout;
