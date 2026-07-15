import { Accordion, Badge, Box, Container, Grid, Heading, HStack, Image, Link, Text, VStack } from "@chakra-ui/react";
import { type ReactNode, useMemo } from "react";
import { LuCalendarDays, LuClock3, LuPenLine } from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { ArticleConversionCta } from "./ArticleConversionCta";
import { ArticleBreadcrumbs, ArticleNotFound, ArticleSiteShell } from "./ArticleSiteShell";
import { ArticleMetaItem, formatJapaneseDate, RelatedArticles } from "./ArticleSummary";
import type { ArticleContent } from "./articleContent";
import { getArticle, getRelatedArticles } from "./articleContent";
import type { ArticleHeroImage } from "./articleMeta";
import { sitePage } from "./articleMeta";
import { createArticleMdxComponents } from "./mdxComponents";

type ArticleSitePageProps = {
  slug?: string;
  categorySlug?: string;
};

export function ArticlePage({ slug }: ArticleSitePageProps): ReactNode {
  const article = getArticle(slug);

  if (!article) {
    return <ArticleNotFound />;
  }

  const relatedArticles = getRelatedArticles(article);
  const shouldShowToc = article.toc.length >= 3;

  return (
    <ArticleSiteShell>
      <ArticleHero article={article} />
      <Container
        maxW={{ base: "820px", xl: shouldShowToc ? "1300px" : "820px" }}
        px={{ base: 4, lg: 8, xl: 0 }}
        py={{ base: 8, lg: 10 }}
      >
        <Grid
          templateColumns={{
            base: "1fr",
            xl: shouldShowToc ? "minmax(0, 216px) minmax(0, 820px) minmax(0, 216px)" : "minmax(0, 820px)",
          }}
          justifyContent="center"
          columnGap={{ xl: 6 }}
          alignItems="start"
        >
          {shouldShowToc && <ArticleAside article={article} />}
          <VStack
            gridColumn={{ base: "1", xl: shouldShowToc ? "2" : "1" }}
            align="stretch"
            gap={{ base: 8, lg: 10 }}
            w="full"
            maxW="820px"
          >
            {shouldShowToc && <MobileArticleToc article={article} />}
            <ArticleBody article={article} />
            <ArticleConversionCta compact />
            <RelatedArticles articles={relatedArticles} />
          </VStack>
        </Grid>
      </Container>
    </ArticleSiteShell>
  );
}

function ArticleHero({ article }: { article: ArticleContent }): ReactNode {
  const shouldShowUpdatedAt = Boolean(article.meta.updatedAt && article.meta.updatedAt !== article.meta.publishedAt);
  const heroImage = article.meta.heroImage;

  return (
    <Box borderBottomWidth="1px" borderColor="gray.200" bg="white">
      <Container maxW={heroImage ? "1120px" : "820px"} px={{ base: 4, lg: heroImage ? 8 : 0 }} py={{ base: 8, lg: 10 }}>
        <Grid
          templateColumns={{ base: "1fr", lg: heroImage ? `minmax(0, 1fr) ${heroImage.width}px` : "1fr" }}
          gap={{ base: 5, lg: 8 }}
          alignItems="center"
        >
          <VStack align="stretch" gap={{ base: 5, md: 6 }} minW={0}>
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
                items={[
                  { label: sitePage.breadcrumbLabel, href: "/articles" },
                  { label: article.meta.categoryLabel, href: `/articles/categories/${article.meta.categorySlug}` },
                  { label: article.meta.title },
                ]}
              />
            </Box>
            <HStack gap={{ base: 2.5, md: 3 }} wrap="wrap" color="gray.700" textStyle="sm">
              <Badge colorPalette="green" variant="subtle" borderRadius="full" px={3} py={1}>
                {article.meta.categoryLabel}
              </Badge>
              <ArticleMetaItem icon={LuCalendarDays}>{formatJapaneseDate(article.meta.publishedAt)}</ArticleMetaItem>
              {shouldShowUpdatedAt && (
                <ArticleMetaItem icon={LuPenLine}>
                  更新 {formatJapaneseDate(article.meta.updatedAt ?? "")}
                </ArticleMetaItem>
              )}
              <ArticleMetaItem icon={LuClock3}>{article.meta.readingMinutes}分で読めます</ArticleMetaItem>
            </HStack>
            <VStack align="stretch" gap={{ base: 3, md: 4 }}>
              <Heading as="h1" color="gray.950" textStyle="pageTitle" letterSpacing="0">
                {article.meta.title}
              </Heading>
              <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" maxW="680px">
                {article.meta.description}
              </Text>
            </VStack>
          </VStack>
          {heroImage && <ArticleHeroImageFigure image={heroImage} />}
        </Grid>
      </Container>
    </Box>
  );
}

function ArticleBody({ article }: { article: ArticleContent }): ReactNode {
  const components = useMemo(() => createArticleMdxComponents(article.resolveImageSrc), [article]);

  return (
    <VStack as="article" align="stretch" gap={{ base: 6, lg: 7 }}>
      <article.Content components={components} />
    </VStack>
  );
}

function ArticleAside({ article }: { article: ArticleContent }): ReactNode {
  return (
    <VStack
      as="aside"
      aria-label="この記事の目次"
      align="stretch"
      gap={4}
      display={{ base: "none", xl: "flex" }}
      gridColumn={{ xl: "1" }}
      justifySelf={{ xl: "end" }}
      w="full"
      maxW="216px"
      position={{ base: "static", xl: "sticky" }}
      top={{ xl: `calc(${HEADER_HEIGHT.md} + 24px)` }}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      p={4}
      bg="white"
    >
      <Text fontWeight="bold" color="gray.950">
        この記事の目次
      </Text>
      <VStack as="nav" align="stretch" gap={2}>
        {article.toc.map((item) => (
          <Link
            key={item.id}
            href={`#${item.id}`}
            color="teal.700"
            textStyle="sm"
            lineHeight="1.6"
            _hover={{ color: "teal.800", textDecoration: "none" }}
          >
            {item.text}
          </Link>
        ))}
      </VStack>
    </VStack>
  );
}

function MobileArticleToc({ article }: { article: ArticleContent }): ReactNode {
  return (
    <Accordion.Root collapsible variant="plain" display={{ base: "block", xl: "none" }}>
      <Accordion.Item
        value="toc"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        bg="white"
        overflow="hidden"
      >
        <Accordion.ItemTrigger px={4} py={3} cursor="pointer">
          <HStack flex="1" justify="space-between">
            <Text fontWeight="bold" color="gray.950">
              この記事の目次
            </Text>
            <Accordion.ItemIndicator color="teal.700" />
          </HStack>
        </Accordion.ItemTrigger>
        <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
          <Accordion.ItemBody px={4} py={3}>
            <VStack as="nav" align="stretch" gap={2}>
              {article.toc.map((item) => (
                <Link
                  key={item.id}
                  href={`#${item.id}`}
                  color="teal.700"
                  textStyle="sm"
                  lineHeight="1.6"
                  _hover={{ color: "teal.800", textDecoration: "none" }}
                >
                  {item.text}
                </Link>
              ))}
            </VStack>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}

function ArticleHeroImageFigure({ image }: { image: ArticleHeroImage }): ReactNode {
  return (
    <Box
      as="figure"
      justifySelf={{ base: "center", lg: "end" }}
      w={{ base: "min(260px, 100%)", lg: `${image.width}px` }}
      maxW="full"
    >
      <Box overflow="hidden" borderRadius="lg" bg="transparent" aspectRatio={16 / 9}>
        <Image src={image.src} alt={image.alt} w="full" h="full" objectFit="contain" />
      </Box>
    </Box>
  );
}
