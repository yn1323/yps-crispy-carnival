import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuCalendarX } from "react-icons/lu";
import { SubmitPageLayout } from "../SubmitPageLayout";

type Props = {
  shopName: string;
};

export const ExpiredSubmitView = ({ shopName }: Props) => {
  return (
    <SubmitPageLayout>
      {/* Header (full-width bg) */}
      <Box bg="teal.600" w="full">
        <Box maxW="1024px" mx="auto" px={4} pt={3} pb={4}>
          <Text fontSize="xs" color="white" opacity={0.8}>
            {shopName}
          </Text>
          <Text fontSize="xl" fontWeight="bold" color="white">
            シフト希望を提出
          </Text>
        </Box>
      </Box>

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
