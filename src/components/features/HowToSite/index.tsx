import { Box, Container, Flex, Grid, Heading, Icon, Input, Link, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { LuArrowRight, LuCircleHelp, LuLink, LuSearch } from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Empty } from "@/src/components/ui/Empty";
import {
  HELP_CATEGORIES,
  HELP_NAVIGATION_GROUPS,
  type HelpArticle,
  type HelpCategory,
  helpArticles,
  searchHelpArticles,
} from "./helpContent";
import { helpMdxComponents } from "./mdxComponents";

type HowToSiteProps = {
  articles?: HelpArticle[];
};

export function HowToSite({ articles = helpArticles }: HowToSiteProps) {
  const [query, setQuery] = useState("");
  const visibleArticles = useMemo(() => searchHelpArticles(articles, query), [articles, query]);
  const visibleCategories = useMemo(() => groupArticlesByCategory(visibleArticles), [visibleArticles]);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    const scrollToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;

      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <HowToHero query={query} onQueryChange={setQuery} />
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 6, lg: 10 }}>
        {visibleCategories.length > 0 ? (
          <>
            <MobileNavigation categories={visibleCategories.map(({ category }) => category)} />
            {hasQuery && (
              <Text mb={{ base: 6, lg: 8 }} color="gray.600" fontSize="sm">
                {visibleArticles.length}件見つかりました
              </Text>
            )}
            <Grid templateColumns={{ base: "1fr", lg: "240px minmax(0, 720px)" }} gap={{ lg: 12 }} alignItems="start">
              <DesktopNavigation categories={visibleCategories.map(({ category }) => category)} />
              <Stack gap={{ base: 12, lg: 16 }} minW={0}>
                {visibleCategories.map(({ category, articles }) => (
                  <HelpCategorySection key={category.id} category={category} articles={articles} />
                ))}
              </Stack>
            </Grid>
          </>
        ) : (
          <Empty
            icon={LuSearch}
            title="該当する使い方が見つかりません"
            description="キーワードを短くするか、別の言い方で検索してください。"
            variant="section"
            tone="neutral"
            minH="280px"
          />
        )}
        <SupportSection />
      </Container>
    </PublicPageLayout>
  );
}

function HowToHero({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  return (
    <Box borderBottomWidth="1px" borderColor="gray.200" bg="gray.50/60">
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 6, lg: 8 }}>
        <Stack gap={4} maxW="640px">
          <Heading as="h1" color="gray.950" fontSize={{ base: "2xl", lg: "3xl" }} letterSpacing="0">
            使い方・ヘルプ
          </Heading>
          <Box position="relative">
            <Icon
              as={LuSearch}
              position="absolute"
              insetStart={3.5}
              top="50%"
              transform="translateY(-50%)"
              boxSize={4.5}
              color="gray.500"
              pointerEvents="none"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              aria-label="使い方・ヘルプを検索"
              placeholder="例：LINEが届かない、スタッフを追加したい"
              ps={10}
              pe={4}
              bg="white"
              borderColor="gray.300"
              borderRadius="md"
              _focusVisible={{ borderColor: "teal.600", boxShadow: "0 0 0 1px var(--chakra-colors-teal-600)" }}
            />
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}

function DesktopNavigation({ categories }: { categories: HelpCategory[] }) {
  return (
    <Box
      as="aside"
      aria-label="使い方・ヘルプの目次"
      display={{ base: "none", lg: "block" }}
      position="sticky"
      top={`calc(${HEADER_HEIGHT.md} + 32px)`}
      maxH={`calc(100dvh - ${HEADER_HEIGHT.md} - 64px)`}
      overflowY="auto"
      borderRightWidth="1px"
      borderColor="gray.200"
      pe={8}
    >
      <Text mb={5} color="gray.950" fontWeight="bold">
        探し方
      </Text>
      <NavigationGroups categories={categories} compact={false} />
    </Box>
  );
}

function MobileNavigation({ categories }: { categories: HelpCategory[] }) {
  return (
    <Box display={{ base: "block", lg: "none" }} mb={8} pb={6} borderBottomWidth="1px" borderColor="gray.200">
      <Text mb={4} color="gray.950" fontWeight="bold">
        探し方
      </Text>
      <NavigationGroups categories={categories} compact />
    </Box>
  );
}

function NavigationGroups({ categories, compact }: { categories: HelpCategory[]; compact: boolean }) {
  return (
    <Stack gap={compact ? 4 : 6}>
      {HELP_NAVIGATION_GROUPS.map((group) => {
        const groupCategories = categories.filter((category) => category.navigationGroup === group.id);
        if (groupCategories.length === 0) return null;

        return (
          <Stack key={group.id} gap={compact ? 2 : 2.5}>
            <Text color="gray.600" fontSize="xs" fontWeight="bold">
              {group.label}
            </Text>
            <Flex direction={compact ? "row" : "column"} align={compact ? "center" : "stretch"} gap={2} wrap="wrap">
              {groupCategories.map((category) => (
                <Link
                  key={category.id}
                  href={`#category-${category.id}`}
                  display="inline-flex"
                  alignItems="center"
                  alignSelf="flex-start"
                  px={compact ? 3 : 0}
                  py={compact ? 1.5 : 0}
                  borderWidth={compact ? "1px" : undefined}
                  borderColor={compact ? "gray.200" : undefined}
                  borderRadius={compact ? "full" : undefined}
                  color="gray.800"
                  fontSize="sm"
                  fontWeight="semibold"
                  _hover={{ color: "teal.700", textDecoration: "none", borderColor: "teal.300" }}
                >
                  {category.label}
                </Link>
              ))}
            </Flex>
          </Stack>
        );
      })}
    </Stack>
  );
}

function HelpCategorySection({ category, articles }: { category: HelpCategory; articles: HelpArticle[] }) {
  return (
    <Box as="section" id={`category-${category.id}`} scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}>
      <Heading as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }} letterSpacing="0" mb={2}>
        {category.label}
      </Heading>
      <Stack gap={0} divideY="1px" divideColor="gray.200">
        {articles.map((article) => (
          <HelpArticleView key={article.slug} article={article} />
        ))}
      </Stack>
    </Box>
  );
}

function HelpArticleView({ article }: { article: HelpArticle }) {
  const Content = article.Content;

  return (
    <Box as="article" id={article.slug} py={{ base: 6, lg: 7 }} scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}>
      <Flex align="flex-start" justify="space-between" gap={3}>
        <Heading as="h3" color="gray.950" fontSize={{ base: "lg", lg: "xl" }} lineHeight="1.5" letterSpacing="0">
          {article.meta.title}
        </Heading>
        <Link
          href={`#${article.slug}`}
          aria-label={`「${article.meta.title}」へのリンク`}
          color="gray.500"
          flexShrink={0}
          mt={1}
          p={1}
          borderRadius="sm"
          _hover={{ color: "teal.700", bg: "teal.50" }}
        >
          <LuLink aria-hidden />
        </Link>
      </Flex>
      <Box mt={3} css={{ "& > * + *": { marginTop: "var(--chakra-spacing-4)" } }}>
        <Content components={helpMdxComponents} />
      </Box>
    </Box>
  );
}

function SupportSection() {
  return (
    <Stack
      mt={{ base: 12, lg: 16 }}
      pt={{ base: 8, lg: 10 }}
      borderTopWidth="1px"
      borderColor="gray.200"
      align={{ base: "stretch", md: "flex-end" }}
      gap={3}
    >
      <Stack gap={1} align={{ base: "flex-start", md: "flex-end" }} textAlign={{ md: "right" }}>
        <Flex align="center" gap={2} color="gray.950" fontWeight="bold" justify={{ md: "flex-end" }}>
          <LuCircleHelp aria-hidden />
          解決しない場合
        </Flex>
        <Text color="gray.600" fontSize="sm">
          状況を確認してご案内します。
        </Text>
      </Stack>
      <Link href="/contact" color="teal.700" fontWeight="bold" display="inline-flex" alignItems="center" gap={2}>
        お問い合わせ
        <LuArrowRight aria-hidden />
      </Link>
    </Stack>
  );
}

function groupArticlesByCategory(articles: HelpArticle[]): Array<{ category: HelpCategory; articles: HelpArticle[] }> {
  return HELP_CATEGORIES.map((category) => ({
    category,
    articles: articles.filter((article) => article.category.id === category.id),
  })).filter(({ articles: categoryArticles }) => categoryArticles.length > 0);
}
