import {
  Accordion,
  Badge,
  Box,
  Container,
  Flex,
  Grid,
  Heading,
  HStack,
  Image,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react";
import { type ReactNode, useMemo } from "react";
import type { IconType } from "react-icons";
import {
  LuBookOpen,
  LuCalendarCheck,
  LuCalendarDays,
  LuCheck,
  LuChevronRight,
  LuClock3,
  LuFileSpreadsheet,
  LuMessageCircle,
  LuPenLine,
  LuTable2,
} from "react-icons/lu";
import { FooterSection as Footer } from "@/src/components/features/LandingPage/FooterSection";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import { ArticleConversionCta } from "./ArticleConversionCta";
import type { ArticleContent } from "./articleContent";
import {
  articles,
  getArticle,
  getArticlesByCategory,
  getRelatedArticles,
  getRepresentativeArticle,
} from "./articleContent";
import type { ArticleHeroImage, CategoryMetadata, ConcernContent } from "./articleMeta";
import { concerns, getCategoryMeta, sitePage } from "./articleMeta";
import { createArticleMdxComponents } from "./mdxComponents";

type ArticleSitePageProps = {
  slug?: string;
  categorySlug?: string;
};

export function ArticleListPage(): ReactNode {
  return (
    <ArticleSiteShell>
      <ListHero />
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 12 }}>
        <VStack align="stretch" gap={{ base: 10, lg: 12 }}>
          <ConcernSection />
          <ArticleListSection title={sitePage.latestTitle} articles={articles} />
          <ArticleConversionCta />
        </VStack>
      </Container>
    </ArticleSiteShell>
  );
}

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

function ArticleSiteShell({ children }: { children: ReactNode }): ReactNode {
  return (
    <Box bg="white" color="fg" minH="100vh">
      <Header
        variant="public"
        showLinks={false}
        showLogin={false}
        bg="white"
        boxShadow={{ base: "0 8px 20px rgba(15, 23, 42, 0.04)", md: "none" }}
      />
      <Box as="main" pt={HEADER_HEIGHT.base}>
        {children}
      </Box>
      <Footer />
    </Box>
  );
}

function ListHero(): ReactNode {
  return (
    <Box borderBottomWidth="1px" borderColor="gray.200" bg="white">
      <Container maxW={{ base: "820px", lg: "6xl" }} px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 10 }}>
        <VStack align="stretch" gap={{ base: 5, md: 6 }}>
          <Box display={{ base: "none", md: "block" }}>
            <Breadcrumbs items={[{ label: sitePage.breadcrumbLabel }]} />
          </Box>
          <VStack align="stretch" gap={{ base: 3, md: 4 }}>
            <Heading as="h1" color="gray.950" textStyle="pageTitle" letterSpacing="0">
              {sitePage.title}
            </Heading>
            <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" maxW="680px">
              {sitePage.description}
            </Text>
          </VStack>
        </VStack>
      </Container>
    </Box>
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
              <Breadcrumbs
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
              <MetaItem icon={LuCalendarDays}>{formatJapaneseDate(article.meta.publishedAt)}</MetaItem>
              {shouldShowUpdatedAt && (
                <MetaItem icon={LuPenLine}>更新 {formatJapaneseDate(article.meta.updatedAt ?? "")}</MetaItem>
              )}
              <MetaItem icon={LuClock3}>{article.meta.readingMinutes}分で読めます</MetaItem>
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
            <Breadcrumbs
              items={[{ label: sitePage.breadcrumbLabel, href: "/articles" }, { label: category.breadcrumbLabel }]}
            />
          </Box>
          <VStack align="stretch" gap={{ base: 3, md: 4 }}>
            <Heading as="h1" color="gray.950" textStyle="pageTitle" letterSpacing="0">
              {category.title}
            </Heading>
            <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" maxW="680px">
              {category.description}
            </Text>
          </VStack>
        </VStack>
      </Container>
    </Box>
  );
}

function ConcernSection(): ReactNode {
  return (
    <VStack as="section" align="stretch" gap={5}>
      <Heading as="h2" textStyle="sectionTitle" color="gray.950">
        {sitePage.concernTitle}
      </Heading>
      <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }} gap={4}>
        {concerns.map((concern) => (
          <ConcernCard key={concern.slug} concern={concern} />
        ))}
      </Grid>
    </VStack>
  );
}

function ConcernCard({ concern }: { concern: ConcernContent }): ReactNode {
  const Icon = getCategoryIcon(concern.slug);

  return (
    <Link
      href={concern.href}
      display="block"
      h="full"
      color="inherit"
      textDecoration="none"
      _hover={{ textDecoration: "none" }}
    >
      <Box
        as="article"
        h="full"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        p={5}
        bg="white"
        transition="border-color 0.2s ease, box-shadow 0.2s ease"
        _hover={{ borderColor: "gray.300", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)" }}
      >
        <VStack align="stretch" gap={{ base: 3, md: 4 }} h="full">
          <HStack align="center" gap={3}>
            <IconBadge icon={Icon} compact />
            <Heading as="h3" flex="1" fontSize="md" lineHeight="1.55" letterSpacing="0" color="gray.950">
              {concern.title}
            </Heading>
            <Box as="span" display={{ base: "block", md: "none" }} color="teal.700">
              <LuChevronRight size={16} />
            </Box>
          </HStack>
          <VStack align="stretch" gap={2} flex="1">
            <Heading
              as="h3"
              display={{ base: "none", md: "block" }}
              fontSize="md"
              lineHeight="1.55"
              letterSpacing="0"
              color="gray.950"
            >
              {concern.title}
            </Heading>
            <Text color="gray.600" textStyle="sm" lineHeight="1.7" lineClamp={{ base: 3, md: undefined }}>
              {concern.description}
            </Text>
          </VStack>
          <Text display={{ base: "none", md: "block" }} color="teal.700" textStyle="sm" fontWeight="bold">
            この困りごとを見る
            <Box as="span" ml={1}>
              →
            </Box>
          </Text>
        </VStack>
      </Box>
    </Link>
  );
}

function ArticleListSection({ title, articles }: { title: string; articles: ArticleContent[] }): ReactNode {
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
            <MetaItem icon={LuClock3}>{article.meta.readingMinutes}分</MetaItem>
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

function PointBox({ category }: { category: CategoryMetadata }): ReactNode {
  return (
    <Box bg="teal.50" borderWidth="1px" borderColor="gray.200" borderRadius="lg" px={{ base: 4, lg: 6 }} py={5}>
      <VStack align="stretch" gap={4}>
        <Text color="green.700" fontWeight="bold">
          このカテゴリで扱う悩み
        </Text>
        <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8">
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
            <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8">
              {article.meta.description}
            </Text>
            <HStack gap={4} color="gray.500" textStyle="sm" wrap="wrap">
              <Text>{formatJapaneseDate(article.meta.publishedAt)}</Text>
              <MetaItem icon={LuClock3}>{article.meta.readingMinutes}分</MetaItem>
            </HStack>
          </VStack>
        </Box>
      </Link>
    </VStack>
  );
}

function CompactArticleList({ title, articles }: { title: string; articles: ArticleContent[] }): ReactNode {
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

function RelatedArticles({ articles }: { articles: ArticleContent[] }): ReactNode {
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
          <MetaItem icon={LuClock3}>{article.meta.readingMinutes}分</MetaItem>
        </HStack>
      </VStack>
    </Link>
  );
}

function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }): ReactNode {
  return (
    <HStack as="nav" gap={2} color="gray.600" textStyle="sm" wrap="wrap">
      <Link href="/" color="gray.600" _hover={{ color: "teal.700", textDecoration: "none" }}>
        ホーム
      </Link>
      {items.map((item) => (
        <HStack key={`${item.href ?? item.label}-${item.label}`} gap={2}>
          <Text color="gray.400">/</Text>
          {item.href ? (
            <Link href={item.href} color="gray.600" _hover={{ color: "teal.700", textDecoration: "none" }}>
              {item.label}
            </Link>
          ) : (
            <Text color="gray.800" fontWeight="medium">
              {item.label}
            </Text>
          )}
        </HStack>
      ))}
    </HStack>
  );
}

function IconBadge({ icon, compact = false }: { icon: IconType; compact?: boolean }): ReactNode {
  const Icon = icon;

  return (
    <Flex
      boxSize={compact ? { base: 10, md: 12 } : 12}
      flexShrink={0}
      borderRadius="full"
      bg="teal.50"
      borderWidth="1px"
      borderColor="gray.200"
      color="teal.700"
      align="center"
      justify="center"
    >
      <Icon size={24} />
    </Flex>
  );
}

function MetaItem({ icon, children }: { icon: IconType; children: ReactNode }): ReactNode {
  const Icon = icon;

  return (
    <HStack as="span" gap={1.5}>
      <Icon size={14} />
      <Text as="span">{children}</Text>
    </HStack>
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

function ArticleNotFound({ title = "記事が見つかりません" }: { title?: string }): ReactNode {
  return (
    <ArticleSiteShell>
      <Container maxW="720px" px={{ base: 4, lg: 0 }} py={{ base: 16, lg: 24 }}>
        <VStack align="stretch" gap={4}>
          <Badge alignSelf="flex-start" colorPalette="orange" variant="subtle">
            Not found
          </Badge>
          <Heading as="h1" textStyle="pageTitle" color="gray.950">
            {title}
          </Heading>
          <Text color="gray.700" lineHeight="1.8">
            指定されたページは、現在の記事一覧に含まれていません。
          </Text>
        </VStack>
      </Container>
    </ArticleSiteShell>
  );
}

function getCategoryIcon(slug: string): IconType {
  switch (slug) {
    case "shift-request":
      return LuMessageCircle;
    case "shift-building":
      return LuTable2;
    case "shift-operation":
      return LuCalendarCheck;
    case "tool-review":
      return LuFileSpreadsheet;
    default:
      return LuBookOpen;
  }
}

function formatJapaneseDate(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) {
    return date;
  }

  return `${Number(year)}.${month}.${day}`;
}
