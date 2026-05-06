import { Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuCalendarX } from "react-icons/lu";
import { SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";

type Props = {
  shopName: string;
};

export const ExpiredSubmitView = ({ shopName }: Props) => {
  return (
    <SubmitPageLayout>
      <SubmitPageHeader shopName={shopName} />

      {/* Content */}
      <Flex flex={1} align="center" justify="center" bg="white">
        <VStack gap={4}>
          <Icon color="fg.subtle" boxSize={12}>
            <LuCalendarX />
          </Icon>
          <Text fontSize="lg" fontWeight="semibold">
            提出締切を過ぎました
          </Text>
          <Text fontSize="sm" color="fg.muted" textAlign="center">
            変更したい日がある場合は、{"\n"}シフト作成担当者に連絡してください。
          </Text>
        </VStack>
      </Flex>
    </SubmitPageLayout>
  );
};
