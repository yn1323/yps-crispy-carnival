import { Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuMail } from "react-icons/lu";

export const ReissueDone = () => {
  return (
    <Flex flex={1} align="center" justify="center" px={8}>
      <VStack gap={4}>
        <Icon as={LuMail} boxSize={12} color="teal.500" />
        <Text fontSize="lg" fontWeight="semibold" textAlign="center">
          メールを送信しました
        </Text>
        <Text fontSize="sm" color="fg.muted" textAlign="center" lineHeight="tall">
          ご入力いただいたメールアドレスに{"\n"}新しい閲覧リンクをお送りしました。{"\n"}メールをご確認ください。
        </Text>
        <Text fontSize="xs" color="fg.subtle" textAlign="center" lineHeight="tall">
          メールが届かない場合は{"\n"}お店に直接ご連絡ください。
        </Text>
      </VStack>
    </Flex>
  );
};
