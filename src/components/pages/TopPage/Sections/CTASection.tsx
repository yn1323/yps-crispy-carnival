import { Box, Button, Container, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { MdArrowForward } from "react-icons/md";

export const CTASection = () => {
  return (
    <Box
      as="section"
      py={{ base: "16", sm: "24" }}
      bgGradient="to-br"
      gradientFrom="teal.600"
      gradientTo="teal.700"
      position="relative"
      overflow="hidden"
    >
      <Box position="absolute" inset="0" opacity="0.2" />

      <Container maxW="4xl" position="relative" zIndex="10" textAlign="center">
        <VStack gap="6">
          <Text fontSize={{ base: "2xl", md: "3xl" }} color="white">
            今すぐシフト管理を
            <Box as="br" display={{ base: "block", sm: "none" }} />
            スムーズに
          </Text>

          <Text fontSize={{ base: "md", md: "lg" }} color="teal.50" maxW="2xl">
            煩雑なシフト管理から解放。無料プランで今すぐ始められます。
          </Text>

          <Flex direction={{ base: "column", sm: "row" }} gap="4" justify="center">
            <Button size="lg" variant="outline" colorPalette="teal" bg="white" gap="2">
              無料で始める
              <Icon as={MdArrowForward} boxSize="5" />
            </Button>
          </Flex>

          <Text fontSize="sm" color="teal.100" mt="8">
            10人まで永久無料 • いつでも解約可能
          </Text>
        </VStack>
      </Container>
    </Box>
  );
};
