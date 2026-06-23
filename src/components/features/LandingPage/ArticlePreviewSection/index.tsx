import { Badge, Box, Container, Flex, Heading, HStack, Icon, Link, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { LuArrowRight, LuClock3 } from "react-icons/lu";
import type { ArticleContent } from "@/src/components/features/ArticleSite/articleContent";
import { articles, sitePage } from "@/src/components/features/ArticleSite/articleContent";
import { Button } from "@/src/components/ui/Button";

const previewArticles = articles.slice(0, sitePage.landingPreviewLimit);

export const ArticlePreviewSection = () => {
  if (previewArticles.length === 0) {
    return null;
  }

  return (
    <Box as="section" bg="gray.50" py={{ base: 12, md: 16 }}>
      <Container maxW="7xl">
        <VStack align="stretch" gap={{ base: 7, md: 8 }}>
          <VStack align="start" gap={3} maxW="680px">
            <Text color="teal.700" textStyle="sm" fontWeight="bold">
              お役立ち記事
            </Text>
            <Heading
              as="h2"
              color="gray.950"
              fontSize={{ base: "xl", md: "2xl" }}
              lineHeight={{ base: "1.6rem", md: "2rem" }}
              letterSpacing="0"
            >
              {sitePage.landingPreviewTitle}
            </Heading>
            <Text color="gray.700" textStyle={{ base: "sm", md: "md" }} lineHeight="1.8">
              {sitePage.landingPreviewDescription}
            </Text>
          </VStack>

          <VStack align="stretch" gap={{ base: 4, md: 5 }}>
            <SimpleGrid columns={{ base: 1, md: previewArticles.length >= 3 ? 3 : previewArticles.length }} gap={4}>
              {previewArticles.map((article) => (
                <ArticlePreviewCard key={article.meta.slug} article={article} />
              ))}
            </SimpleGrid>

            <Button asChild variant="outline" colorPalette="teal" alignSelf="end" borderRadius="full" size="sm" px={5}>
              <Link href="/articles">
                {sitePage.landingPreviewLinkLabel}
                <LuArrowRight />
              </Link>
            </Button>
          </VStack>
        </VStack>
      </Container>
    </Box>
  );
};

const ArticlePreviewCard = ({ article }: { article: ArticleContent }) => (
  <Link
    href={article.meta.canonicalPath}
    display="block"
    color="inherit"
    textDecoration="none"
    _hover={{ textDecoration: "none" }}
  >
    <Flex
      as="article"
      direction="column"
      minH={{ md: "236px" }}
      h="full"
      bg="white"
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      p={{ base: 5, md: 6 }}
      transition="border-color 0.2s ease, box-shadow 0.2s ease"
      _hover={{
        borderColor: "gray.300",
        boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)",
      }}
    >
      <VStack align="stretch" gap={4} flex="1">
        <HStack align="center" justify="space-between" gap={3}>
          <Badge colorPalette="green" variant="subtle" borderRadius="full">
            {article.meta.categoryLabel}
          </Badge>
          <Icon hideFrom="md" as={LuArrowRight} boxSize={4} color="teal.700" flexShrink={0} />
        </HStack>
        <Heading as="h3" color="gray.950" fontSize={{ base: "md", md: "lg" }} lineHeight="1.55" letterSpacing="0">
          {article.meta.title}
        </Heading>
        <Text hideBelow="md" color="gray.700" textStyle="sm" lineHeight="1.8" lineClamp={3}>
          {article.meta.description}
        </Text>
      </VStack>

      <HStack hideBelow="md" justify="space-between" gap={4} mt={5} color="gray.500" textStyle="sm">
        <HStack gap={2}>
          <Icon as={LuClock3} boxSize={4} />
          <Text>{article.meta.readingMinutes}分で読める</Text>
        </HStack>
        <Icon as={LuArrowRight} boxSize={4} color="teal.700" />
      </HStack>
    </Flex>
  </Link>
);
