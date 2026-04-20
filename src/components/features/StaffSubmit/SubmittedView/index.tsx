import { Box, Circle, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { SubmitPageLayout } from "../SubmitPageLayout";

export const SubmittedView = () => {
  return (
    <SubmitPageLayout>
      <Box bg="teal.600" w="full">
        <Box maxW="1024px" mx="auto" px={4} pt={3} pb={4}>
          <Text fontSize="xl" fontWeight="bold" color="white">
            シフト希望を提出
          </Text>
        </Box>
      </Box>

      <Flex flex={1} align="center" justify="center" bg="white" px={4}>
        <VStack gap={4}>
          <Circle size="64px" bg="teal.600">
            <Icon color="white" boxSize={8}>
              <LuCheck />
            </Icon>
          </Circle>
          <Text fontSize="xl" fontWeight="bold">
            提出が完了しました
          </Text>
          <VStack gap={1}>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              店長からの連絡をお待ちください
            </Text>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              このページは閉じて大丈夫です
            </Text>
          </VStack>
        </VStack>
      </Flex>
    </SubmitPageLayout>
  );
};
