import { Box, Container, Heading, Text, VStack } from "@chakra-ui/react";

export const FaqSection = () => (
  <Box as="section" py={{ base: 14, md: 20 }}>
    <Container maxW="6xl">
      <VStack align="start" gap={4}>
        <Heading as="h2" fontSize={{ base: "2xl", md: "4xl" }}>
          よくある質問
        </Heading>
        <Text color="fg.muted">導入前の不安や運用上の疑問に答えるセクションです。</Text>
      </VStack>
    </Container>
  </Box>
);
