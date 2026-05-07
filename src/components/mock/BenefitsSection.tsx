import { Box, Container, Heading, Text, VStack } from "@chakra-ui/react";

export const BenefitsSection = () => (
  <Box as="section" py={{ base: 14, md: 20 }}>
    <Container maxW="6xl">
      <VStack align="start" gap={4}>
        <Heading as="h2" fontSize={{ base: "2xl", md: "4xl" }}>
          シフトを作る人、出す人のメリット
        </Heading>
        <Text color="fg.muted">管理者とスタッフ、それぞれにとっての使いやすさを並べて見せます。</Text>
      </VStack>
    </Container>
  </Box>
);
