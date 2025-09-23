import { Box } from "@chakra-ui/react";
import { UserForm } from "@/src/components/features/register/UserForm";

export const Welcome = () => {
  return (
    <Box as="main" minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="gray.50" py={8}>
      <Box>
        YPSへようこそ
        <br />
        （みたいなもりあがる感じのメッセージを書きたい）
        <UserForm callbackRoutingPath="/mypage" />
      </Box>
    </Box>
  );
};
