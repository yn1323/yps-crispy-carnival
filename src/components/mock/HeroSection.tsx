import { Box, Container, Heading, Text, VStack } from "@chakra-ui/react";

export const HeroSection = () => (
  <Box as="section" bg="teal.50" py={{ base: 16, md: 24 }}>
    <Container maxW="6xl">
      <VStack align="start" gap={5}>
        <Text color="teal.700" fontWeight="bold">
          シフト管理SaaS
        </Text>
        <Heading as="h1" textStyle="heroTitle" lineHeight="1.1">
          店舗のシフト調整を、もっと軽く。
        </Heading>
        <Text maxW="2xl" color="fg.muted" textStyle={{ base: "body", md: "lg" }}>
          LINEで提出、画面で確認。作る人にも出す人にも迷いが少ないシフト管理へ。
        </Text>
      </VStack>
    </Container>
  </Box>
);
