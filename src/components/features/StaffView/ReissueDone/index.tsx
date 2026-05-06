import { Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuSend } from "react-icons/lu";

export const ReissueDone = () => {
  return (
    <Flex flex={1} align="center" justify="center" px={8}>
      <VStack gap={4}>
        <Icon as={LuSend} boxSize={12} color="teal.500" />
        <Text fontSize="lg" fontWeight="semibold" textAlign="center">
          閲覧リンクをお送りしました
        </Text>
        <Text fontSize="sm" color="fg.muted" textAlign="center" lineHeight="tall">
          LINE連携済みの方はLINEに、{"\n"}そうでない方はメールに{"\n"}新しい閲覧リンクをお送りしました。
        </Text>
        <Text fontSize="xs" color="fg.subtle" textAlign="center" lineHeight="tall">
          届かない場合は{"\n"}お店に直接ご連絡ください。
        </Text>
      </VStack>
    </Flex>
  );
};
