import { Box, Container, Heading, Text, VStack } from "@chakra-ui/react";

export const FeatureSection = () => (
  <Box as="section" bg="gray.50" py={{ base: 14, md: 20 }}>
    <Container maxW="6xl">
      <VStack align="start" gap={4}>
        <Heading as="h2" fontSize={{ base: "2xl", md: "4xl" }}>
          できること
        </Heading>
        <Text color="fg.muted">提出、確認、作成、共有までの主要機能を伝えるセクションです。</Text>
      </VStack>
    </Container>
  </Box>
);
