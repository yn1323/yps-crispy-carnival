import { Badge, Box, Container, Grid, Heading, HStack, Link, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCheck, LuClock3 } from "react-icons/lu";
import { ArticleConversionCta } from "./ArticleConversionCta";
import { ArticleBreadcrumbs, ArticleNotFound, ArticleSiteShell } from "./ArticleSiteShell";
import { ArticleMetaItem, CompactArticleList, formatJapaneseDate } from "./ArticleSummary";
import type { ArticleContent } from "./articleContent";
import { getArticlesByCategory, getRepresentativeArticle } from "./articleContent";
import type { CategoryMetadata, ConcernContent } from "./articleMeta";
import { concerns, getCategoryMeta, sitePage } from "./articleMeta";

type ArticleSitePageProps = {
  slug?: string;
  categorySlug?: string;
};

export function ArticleCategoryPage({ categorySlug }: ArticleSitePageProps): ReactNode {
  const category = getCategoryMeta(categorySlug);

  if (!category) {
    return <ArticleNotFound title="カテゴリが見つかりません" />;
  }

  const representativeArticle = getRepresentativeArticle(category);
  const categoryArticles = getArticlesByCategory(category.slug);
  const relatedArticles = representativeArticle
    ? categoryArticles.filter((article) => article.meta.slug !== representativeArticle.meta.slug)
    : categoryArticles;
  const relatedConcerns = category.relatedConcernSlugs
    .map((slug) => concerns.find((concern) => concern.slug === slug))
    .filter((concern): concern is ConcernContent => Boolean(concern));

  return (
    <ArticleSiteShell>
      <CategoryHero category={category} />
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 12 }}>
        <VStack align="stretch" gap={{ base: 8, lg: 10 }}>
          <PointBox category={category} />
          {representativeArticle && <RepresentativeArticle article={representativeArticle} />}
          <CompactArticleList title="関連記事" articles={relatedArticles} />
          <RelatedConcernSection concerns={relatedConcerns} />
          <ArticleConversionCta />
        </VStack>
      </Container>
    </ArticleSiteShell>
  );
}

function CategoryHero({ category }: { category: CategoryMetadata }): ReactNode {
  return (
    <Box borderBottomWidth="1px" borderColor="gray.200" bg="white">
      <Container maxW={{ base: "820px", lg: "6xl" }} px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 10 }}>
        <VStack align="stretch" gap={{ base: 5, md: 6 }}>
          <Link
            href="/articles"
            display={{ base: "inline-flex", md: "none" }}
            alignSelf="flex-start"
            color="teal.700"
            textStyle="sm"
            fontWeight="bold"
            _hover={{ color: "teal.800", textDecoration: "none" }}
          >
            お役立ち情報へ戻る
          </Link>
          <Box display={{ base: "none", md: "block" }}>
            <ArticleBreadcrumbs
              items={[{ label: sitePage.breadcrumbLabel, href: "/articles" }, { label: category.breadcrumbLabel }]}
            />
          </Box>
          <VStack align="stretch" gap={{ base: 3, md: 4 }}>
            <Heading as="h1" color="gray.950" textStyle="pageTitle" letterSpacing="0">
              {category.title}
            </Heading>
            <Text
              color="gray.700"
              textStyle={{ base: "bodySm", md: "body" }}
              lineHeight="1.8"
              maxW="680px"
              whiteSpace="pre-line"
            >
              {category.description}
            </Text>
          </VStack>
        </VStack>
      </Container>
    </Box>
  );
}

function PointBox({ category }: { category: CategoryMetadata }): ReactNode {
  return (
    <Box bg="gray.50" borderWidth="1px" borderColor="gray.200" borderRadius="lg" px={{ base: 4, lg: 6 }} py={5}>
      <VStack align="stretch" gap={4}>
        <Text color="green.700" fontWeight="bold">
          このカテゴリで扱う悩み
        </Text>
        <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" whiteSpace="pre-line">
          {category.pointDescription}
        </Text>
        <Grid as="ul" templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={3} listStyleType="none">
          {category.concerns.map((concern) => (
            <HStack as="li" key={concern} align="start" gap={2} color="gray.700" textStyle="sm" lineHeight="1.7">
              <Box as="span" color="teal.700" mt={1}>
                <LuCheck size={14} />
              </Box>
              <Text>{concern}</Text>
            </HStack>
          ))}
        </Grid>
      </VStack>
    </Box>
  );
}

function RepresentativeArticle({ article }: { article: ArticleContent }): ReactNode {
  return (
    <VStack as="section" align="stretch" gap={5}>
      <Heading as="h2" textStyle="sectionTitle" color="gray.950">
        まず読む記事
      </Heading>
      <Link
        href={article.meta.canonicalPath}
        display="block"
        color="inherit"
        textDecoration="none"
        _hover={{ textDecoration: "none" }}
      >
        <Box
          as="article"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="lg"
          p={{ base: 4, md: 5 }}
          transition="border-color 0.2s ease, box-shadow 0.2s ease"
          _hover={{ borderColor: "gray.300", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)" }}
        >
          <VStack align="stretch" gap={3}>
            <Badge alignSelf="flex-start" colorPalette="green" variant="subtle" borderRadius="full">
              {article.meta.categoryLabel}
            </Badge>
            <Heading as="h3" color="gray.950" textStyle={{ base: "lg", md: "xl" }} letterSpacing="0">
              {article.meta.title}
            </Heading>
            <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" whiteSpace="pre-line">
              {article.meta.description}
            </Text>
            <HStack gap={4} color="gray.500" textStyle="sm" wrap="wrap">
              <Text>{formatJapaneseDate(article.meta.publishedAt)}</Text>
              <ArticleMetaItem icon={LuClock3}>{article.meta.readingMinutes}分</ArticleMetaItem>
            </HStack>
          </VStack>
        </Box>
      </Link>
    </VStack>
  );
}

function RelatedConcernSection({ concerns }: { concerns: ConcernContent[] }): ReactNode {
  if (concerns.length === 0) {
    return null;
  }

  return (
    <VStack
      as="section"
      align="stretch"
      gap={4}
      bg="green.50"
      borderWidth="1px"
      borderColor="green.100"
      borderRadius="lg"
      p={5}
    >
      <Text color="green.700" fontWeight="bold">
        ほかの困りごともチェック
      </Text>
      <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }} gap={3}>
        {concerns.map((concern) => (
          <Link
            key={concern.slug}
            href={concern.href}
            bg="white"
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="md"
            p={3}
            color="gray.800"
            textAlign="center"
            textStyle="sm"
            fontWeight="bold"
            _hover={{ color: "teal.700", textDecoration: "none" }}
          >
            {concern.title}
          </Link>
        ))}
      </Grid>
    </VStack>
  );
}
