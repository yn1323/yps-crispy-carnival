import { Box, Text } from "@chakra-ui/react";
import { UserForm } from "@/src/components/features/register/UserForm";

export const WelcomePage = () => {
  return (
    <Box as="main" minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="gray.50" py={8}>
      <Box>
        <Text fontSize="2xl" fontWeight="bold" mb={4} textAlign="center">
          YPSへようこそ！🎉
        </Text>
        <Text fontSize="md" mb={6} textAlign="center" color="gray.600">
          シフト管理をもっと簡単に、もっとスムーズに。
          <br />
          まずはあなたの名前を登録しましょう！
        </Text>
        <UserForm callbackRoutingPath="/mypage" />
      </Box>
    </Box>
  );
};
