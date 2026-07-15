import { Badge, Flex, Grid, Heading, HStack, Link, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuChevronRight, LuClock3 } from "react-icons/lu";
import type { ArticleContent } from "./articleContent";

export function ArticleListSection({ title, articles }: { title: string; articles: ArticleContent[] }): ReactNode {
  return (
    <VStack as="section" align="stretch" gap={5}>
      <Heading as="h2" textStyle="sectionTitle" color="gray.950">
        {title}
      </Heading>
      <VStack align="stretch" gap={0} borderTopWidth="1px" borderColor="gray.200">
        {articles.map((article) => (
          <ArticleRow key={article.meta.slug} article={article} />
        ))}
      </VStack>
    </VStack>
  );
}

export function CompactArticleList({ title, articles }: { title: string; articles: ArticleContent[] }): ReactNode {
  if (articles.length === 0) {
    return null;
  }

  return (
    <VStack as="section" align="stretch" gap={4}>
      <Heading as="h2" textStyle="sectionTitle" color="gray.950">
        {title}
      </Heading>
      <VStack align="stretch" gap={0} borderTopWidth="1px" borderColor="gray.200">
        {articles.map((article) => (
          <ArticleRow key={article.meta.slug} article={article} />
        ))}
      </VStack>
    </VStack>
  );
}

export function RelatedArticles({ articles }: { articles: ArticleContent[] }): ReactNode {
  if (articles.length === 0) {
    return null;
  }

  return (
    <VStack as="section" align="stretch" gap={4}>
      <Heading as="h2" textStyle="sectionTitle" color="gray.950">
        関連記事
      </Heading>
      <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={4}>
        {articles.map((article) => (
          <SmallArticleCard key={article.meta.slug} article={article} />
        ))}
      </Grid>
    </VStack>
  );
}

function ArticleRow({ article, hideOnMobile = false }: { article: ArticleContent; hideOnMobile?: boolean }): ReactNode {
  return (
    <Link
      href={article.meta.canonicalPath}
      display={{ base: hideOnMobile ? "none" : "block", md: "block" }}
      color="inherit"
      textDecoration="none"
      _hover={{ textDecoration: "none" }}
    >
      <Grid
        as="article"
        templateColumns="minmax(0, 1fr) auto"
        gap={{ base: 3, md: 4 }}
        py={4}
        borderBottomWidth="1px"
        borderColor="gray.200"
        alignItems="center"
        transition="border-color 0.2s ease"
        _hover={{ borderColor: "gray.300" }}
      >
        <VStack align="stretch" gap={2}>
          <Badge alignSelf="flex-start" colorPalette="green" variant="subtle" borderRadius="full">
            {article.meta.categoryLabel}
          </Badge>
          <Heading as="h3" color="gray.950" fontSize={{ base: "md", md: "lg" }} lineHeight="1.55" letterSpacing="0">
            {article.meta.title}
          </Heading>
          <Text hideBelow="md" color="gray.700" textStyle="sm" lineHeight="1.7" lineClamp={2}>
            {article.meta.description}
          </Text>
          <HStack gap={4} color="gray.500" textStyle="sm" wrap="wrap">
            <Text>{formatJapaneseDate(article.meta.publishedAt)}</Text>
            <ArticleMetaItem icon={LuClock3}>{article.meta.readingMinutes}分</ArticleMetaItem>
          </HStack>
        </VStack>
        <Flex
          boxSize={8}
          borderRadius="full"
          borderWidth="1px"
          borderColor="gray.200"
          color="teal.700"
          align="center"
          justify="center"
        >
          <LuChevronRight size={16} />
        </Flex>
      </Grid>
    </Link>
  );
}

function SmallArticleCard({ article }: { article: ArticleContent }): ReactNode {
  return (
    <Link
      href={article.meta.canonicalPath}
      display="block"
      h="full"
      color="inherit"
      textDecoration="none"
      _hover={{ textDecoration: "none" }}
    >
      <VStack
        as="article"
        align="stretch"
        gap={2}
        h="full"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        bg="white"
        p={4}
        transition="border-color 0.2s ease, box-shadow 0.2s ease"
        _hover={{ borderColor: "gray.300", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)" }}
      >
        <Badge alignSelf="flex-start" colorPalette="green" variant="subtle" borderRadius="full">
          {article.meta.categoryLabel}
        </Badge>
        <Heading as="h3" color="gray.950" fontSize="sm" lineHeight="1.55" letterSpacing="0">
          {article.meta.title}
        </Heading>
        <Text color="gray.700" textStyle="sm" lineHeight="1.7" lineClamp={{ base: 2, md: 1 }}>
          {article.meta.description}
        </Text>
        <HStack gap={3} color="gray.500" textStyle="sm" wrap="wrap">
          <Text>{formatJapaneseDate(article.meta.publishedAt)}</Text>
          <ArticleMetaItem icon={LuClock3}>{article.meta.readingMinutes}分</ArticleMetaItem>
        </HStack>
      </VStack>
    </Link>
  );
}

export function ArticleMetaItem({ icon, children }: { icon: IconType; children: ReactNode }): ReactNode {
  const Icon = icon;

  return (
    <HStack as="span" gap={1.5}>
      <Icon size={14} />
      <Text as="span">{children}</Text>
    </HStack>
  );
}

export function formatJapaneseDate(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) {
    return date;
  }

  return `${Number(year)}.${month}.${day}`;
}
