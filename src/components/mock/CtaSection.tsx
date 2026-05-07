import { Box, Container, Heading, Text, VStack } from "@chakra-ui/react";

export const CtaSection = () => (
  <Box as="section" bg="teal.600" color="white" py={{ base: 14, md: 20 }}>
    <Container maxW="6xl">
      <VStack align="start" gap={4}>
        <Heading as="h2" fontSize={{ base: "2xl", md: "4xl" }}>
          CTA
        </Heading>
        <Text color="whiteAlpha.900">問い合わせや無料相談へつなげる最後の一押しを配置します。</Text>
      </VStack>
    </Container>
  </Box>
);
