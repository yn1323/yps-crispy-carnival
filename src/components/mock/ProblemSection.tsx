import { Box, Container, Heading, Text, VStack } from "@chakra-ui/react";

export const ProblemSection = () => (
  <Box as="section" py={{ base: 14, md: 20 }}>
    <Container maxW="6xl">
      <VStack align="start" gap={4}>
        <Heading as="h2" fontSize={{ base: "2xl", md: "4xl" }}>
          課題
        </Heading>
        <Text color="fg.muted">シフト提出の催促、転記、変更連絡に時間が取られている状態を整理します。</Text>
      </VStack>
    </Container>
  </Box>
);
