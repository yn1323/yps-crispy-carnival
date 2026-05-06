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
            提出締切を過ぎています
          </Text>
          <Text fontSize="sm" color="fg.muted" textAlign="center">
            シフトの希望がある場合は、{"\n"}お店に直接ご連絡ください。
          </Text>
        </VStack>
      </Flex>
    </SubmitPageLayout>
  );
};
