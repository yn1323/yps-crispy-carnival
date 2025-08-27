"use client";

import { Box, Button, Container, Heading, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";

// TODO: 仮のTOPページ
export const Top = () => {
  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="gray.50" py={8}>
      <Container maxW="4xl" textAlign="center">
        <VStack gap={12}>
          {/* ヒーローセクション */}
          <VStack gap={4}>
            <Heading as="h1" size={["lg", "2xl"]} color="blue.600" fontWeight="bold">
              🏢 YPS Shift Manager
            </Heading>
            <Text fontSize={["md", "lg"]} color="gray.600" maxW="md">
              シンプルなシフト管理システム
            </Text>
          </VStack>

          {/* 機能紹介 */}
          <SimpleGrid columns={[1, 3]} gap={8} w="full">
            <VStack gap={3}>
              <Box fontSize="3xl">✅</Box>
              <Text fontWeight="medium" color="gray.700">
                簡単シフト作成
              </Text>
            </VStack>
            <VStack gap={3}>
              <Box fontSize="3xl">📅</Box>
              <Text fontWeight="medium" color="gray.700">
                勤怠管理
              </Text>
            </VStack>
            <VStack gap={3}>
              <Box fontSize="3xl">⏰</Box>
              <Text fontWeight="medium" color="gray.700">
                タイムカード
              </Text>
            </VStack>
          </SimpleGrid>

          {/* ボタン */}
          <HStack gap={4}>
            <SignInButton>
              <Button colorScheme="blue" size={["md", "lg"]} px={8}>
                ログイン
              </Button>
            </SignInButton>

            <SignUpButton>
              <Button variant="outline" colorScheme="blue" size={["md", "lg"]} px={8}>
                新規登録
              </Button>
            </SignUpButton>
          </HStack>
        </VStack>
      </Container>
    </Box>
  );
};
