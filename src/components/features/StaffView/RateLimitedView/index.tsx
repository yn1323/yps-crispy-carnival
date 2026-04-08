import { Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import { StaffLayout } from "@/src/components/templates/StaffLayout";

type Props = {
  title: string;
};

export const RateLimitedView = ({ title }: Props) => {
  return (
    <StaffLayout shopName={title}>
      <Flex flex={1} align="center" justify="center" px={8}>
        <VStack gap={4}>
          <Icon boxSize={12} color="orange.500">
            <LuTriangleAlert />
          </Icon>
          <Text fontSize="lg" fontWeight="semibold" textAlign="center">
            アクセス制限中
          </Text>
          <Text fontSize="sm" color="fg.muted" textAlign="center">
            しばらく時間を置いてから{"\n"}再度アクセスしてください
          </Text>
        </VStack>
      </Flex>
    </StaffLayout>
  );
};
