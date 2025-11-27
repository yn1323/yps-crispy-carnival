import { Box, Container, Flex, Grid, GridItem, HStack, Icon, Link, Text, VStack } from "@chakra-ui/react";
import { AiOutlineCalendar } from "react-icons/ai";

const footerLinks = {
  product: {
    title: "プロダクト",
    links: ["機能", "デモ", "ロードマップ"],
  },
  company: {
    title: "会社",
    links: ["会社概要", "お問い合わせ", "ブログ"],
  },
  legal: {
    title: "法的事項",
    links: ["利用規約", "プライバシーポリシー", "特定商取引法"],
  },
  support: {
    title: "サポート",
    links: ["ヘルプセンター", "よくある質問", "お問い合わせ"],
  },
};

export const Footer = () => {
  return (
    <Box as="footer" bg="gray.900" color="gray.300">
      <Container maxW="7xl" py={{ base: "12", sm: "16" }}>
        <Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }} gap="8" mb="12">
          <GridItem colSpan={{ base: 2, md: 1 }}>
            <VStack align="start" gap="4">
              <HStack gap="2">
                <Flex w="8" h="8" bg="teal.600" borderRadius="lg" align="center" justify="center">
                  <Icon as={AiOutlineCalendar} boxSize="5" color="white" />
                </Flex>
                <Text color="white">ShiftHub</Text>
              </HStack>
              <Text fontSize="sm" color="gray.400">
                小規模店舗のための
                <br />
                シンプルなシフト管理SaaS
              </Text>
            </VStack>
          </GridItem>

          {Object.entries(footerLinks).map(([key, section]) => (
            <GridItem key={key}>
              <VStack align="start" gap="4">
                <Text color="white" fontSize="sm">
                  {section.title}
                </Text>
                <VStack align="start" gap="2">
                  {section.links.map((link, index) => (
                    <Link
                      key={index}
                      href="#"
                      fontSize="sm"
                      color="gray.400"
                      _hover={{ color: "white" }}
                      transition="colors 0.15s"
                    >
                      {link}
                    </Link>
                  ))}
                </VStack>
              </VStack>
            </GridItem>
          ))}
        </Grid>

        <Flex
          pt="8"
          borderTop="1px"
          borderColor="gray.800"
          direction={{ base: "column", sm: "row" }}
          justify="space-between"
          align="center"
          gap="4"
        >
          <Text fontSize="sm" color="gray.400">
            © 2025 ShiftHub. All rights reserved.
          </Text>
          <HStack gap="6">
            <Link href="#" fontSize="sm" color="gray.400" _hover={{ color: "white" }} transition="colors 0.15s">
              Twitter
            </Link>
            <Link href="#" fontSize="sm" color="gray.400" _hover={{ color: "white" }} transition="colors 0.15s">
              Facebook
            </Link>
            <Link href="#" fontSize="sm" color="gray.400" _hover={{ color: "white" }} transition="colors 0.15s">
              Instagram
            </Link>
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
};
