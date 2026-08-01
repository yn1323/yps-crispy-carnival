import { Accordion, Badge, Box, Container, Flex, Heading, Icon, Input, Link, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { LuArrowRight, LuBookOpen, LuCircleHelp, LuSearch } from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import {
  createFaqPageJsonLd,
  FAQ_CATEGORIES,
  type FaqAudience,
  type FaqEntry,
  faqEntries,
  searchFaqEntries,
} from "./faqContent";
import { faqMdxComponents } from "./mdxComponents";

type FaqSiteProps = {
  entries?: FaqEntry[];
};

export function FaqSite({ entries = faqEntries }: FaqSiteProps) {
  const [query, setQuery] = useState("");
  const [openItems, setOpenItems] = useState<string[]>([]);
  const visibleEntries = useMemo(() => searchFaqEntries(entries, query), [entries, query]);
  const visibleCategories = useMemo(() => groupEntriesByCategory(visibleEntries), [visibleEntries]);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    const openHashItem = () => {
      const id = window.location.hash.slice(1);
      if (!entries.some((entry) => entry.id === id)) return;

      setOpenItems((current) => (current.includes(id) ? current : [...current, id]));
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: "start" });
        document.getElementById(`${id}-trigger`)?.focus({ preventScroll: true });
      });
    };

    openHashItem();
    window.addEventListener("hashchange", openHashItem);
    return () => window.removeEventListener("hashchange", openHashItem);
  }, [entries]);

  const clearSearch = () => {
    setQuery("");
    requestAnimationFrame(() => document.getElementById("faq-search")?.focus());
  };

  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <FaqStructuredData entries={entries} />
      <FaqHero query={query} onQueryChange={setQuery} />
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 7, lg: 12 }}>
        {!hasQuery && <CategoryNavigation />}
        <Text aria-live="polite" color="gray.600" fontSize="sm" mb={{ base: 6, lg: 8 }}>
          {hasQuery ? `${visibleEntries.length}件の質問が見つかりました` : `${entries.length}件の質問を掲載しています`}
        </Text>

        {visibleCategories.length > 0 ? (
          <Accordion.Root
            collapsible
            multiple
            value={openItems}
            onValueChange={({ value }) => setOpenItems(value)}
            variant="plain"
          >
            <Stack gap={{ base: 12, lg: 16 }}>
              {visibleCategories.map(({ category, entries: categoryEntries }) => (
                <FaqCategorySection key={category.id} category={category} entries={categoryEntries} />
              ))}
            </Stack>
          </Accordion.Root>
        ) : (
          <Empty
            icon={LuSearch}
            title="該当する質問が見つかりません"
            description="言葉を短くするか、別の言い方で検索してください。"
            action={
              <Button type="button" variant="outline" onClick={clearSearch}>
                検索をクリア
              </Button>
            }
            variant="section"
            minH="280px"
          />
        )}

        <SupportSection />
      </Container>
    </PublicPageLayout>
  );
}

function FaqStructuredData({ entries }: { entries: FaqEntry[] }) {
  const json = JSON.stringify(createFaqPageJsonLd(entries)).replace(/</g, "\\u003c");

  return <script type="application/ld+json">{json}</script>;
}

function FaqHero({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  return (
    <Box borderBottomWidth="1px" borderColor="gray.200" bg="gray.50/60">
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 6, lg: 9 }}>
        <Link href="/" color="teal.700" fontSize="sm" fontWeight="bold" _hover={{ textDecoration: "none" }}>
          ← TOPへ
        </Link>
        <Stack gap={4} maxW="720px" mt={5}>
          <Heading as="h1" color="gray.950" fontSize={{ base: "2xl", lg: "4xl" }} letterSpacing="0">
            よくある質問
          </Heading>
          <Text color="gray.700" lineHeight="1.8">
            導入前の確認から、シフトの募集・作成、通知、料金、困ったときの対処までまとめています。
          </Text>
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
              id="faq-search"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              aria-label="よくある質問を検索"
              placeholder="例：LINEが届かない、下書き後に再提出"
              ps={10}
              pe={4}
              bg="white"
              borderColor="gray.300"
              borderRadius="md"
              _focusVisible={{ borderColor: "teal.600", boxShadow: "0 0 0 1px var(--chakra-colors-teal-600)" }}
            />
          </Box>
          <Link
            href="/howto"
            color="teal.700"
            fontSize="sm"
            fontWeight="bold"
            display="inline-flex"
            alignItems="center"
            alignSelf="flex-start"
            gap={2}
          >
            <LuBookOpen aria-hidden />
            操作手順から探す
          </Link>
        </Stack>
      </Container>
    </Box>
  );
}

function CategoryNavigation() {
  return (
    <Box as="nav" aria-label="質問カテゴリ" mb={6}>
      <Text mb={3} color="gray.950" fontSize="sm" fontWeight="bold">
        カテゴリから探す
      </Text>
      <Flex gap={2} wrap="wrap">
        {FAQ_CATEGORIES.map((category) => (
          <Link
            key={category.id}
            href={`#category-${category.id}`}
            px={3}
            py={1.5}
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="full"
            color="gray.800"
            fontSize="sm"
            fontWeight="semibold"
            _hover={{ borderColor: "teal.300", color: "teal.700", textDecoration: "none" }}
          >
            {category.label}
          </Link>
        ))}
      </Flex>
    </Box>
  );
}

function FaqCategorySection({ category, entries }: { category: (typeof FAQ_CATEGORIES)[number]; entries: FaqEntry[] }) {
  return (
    <Box as="section" id={`category-${category.id}`} scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}>
      <Flex align="baseline" gap={3} mb={4}>
        <Heading as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }} letterSpacing="0">
          {category.label}
        </Heading>
        <Text color="gray.500" fontSize="sm">
          {entries.length}件
        </Text>
      </Flex>
      <Stack gap={3}>
        {entries.map((entry) => (
          <FaqItem key={entry.id} entry={entry} />
        ))}
      </Stack>
    </Box>
  );
}

function FaqItem({ entry }: { entry: FaqEntry }) {
  const Content = entry.Content;

  return (
    <Accordion.Item
      id={entry.id}
      value={entry.id}
      scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      bg="white"
      overflow="hidden"
    >
      <Heading as="h3" fontSize="inherit" fontWeight="normal">
        <Accordion.ItemTrigger
          id={`${entry.id}-trigger`}
          alignItems="center"
          gap={{ base: 3, md: 4 }}
          px={{ base: 4, md: 6 }}
          py={{ base: 4, md: 5 }}
          cursor="pointer"
          textAlign="left"
          _hover={{ bg: "teal.50/60" }}
        >
          <Box flex="1" minW={0}>
            {entry.audience !== "all" && <AudienceBadge audience={entry.audience} />}
            <Text
              as="span"
              display="block"
              mt={entry.audience === "all" ? 0 : 2}
              color="gray.950"
              fontWeight="bold"
              lineHeight="1.7"
            >
              {entry.question}
            </Text>
          </Box>
          <Accordion.ItemIndicator color="teal.700" flexShrink={0} />
        </Accordion.ItemTrigger>
      </Heading>
      <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
        <Accordion.ItemBody px={{ base: 4, md: 6 }} py={{ base: 5, md: 6 }}>
          <Stack gap={4}>
            <Content components={faqMdxComponents} />
            {entry.howTo && (
              <Link
                href={entry.howTo.href}
                color="teal.700"
                fontWeight="bold"
                display="inline-flex"
                alignItems="center"
                alignSelf="flex-start"
                gap={2}
              >
                {entry.howTo.label}
                <LuArrowRight aria-hidden />
              </Link>
            )}
          </Stack>
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  );
}

function AudienceBadge({ audience }: { audience: Exclude<FaqAudience, "all"> }) {
  const label = audience === "manager" ? "管理者向け" : "スタッフ向け";
  const colorPalette = audience === "manager" ? "teal" : "blue";

  return (
    <Badge colorPalette={colorPalette} variant="subtle" borderRadius="full" px={2}>
      {label}
    </Badge>
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
          FAQで解決しない場合
        </Flex>
        <Text color="gray.600" fontSize="sm">
          画面名、行った操作、表示された文言を添えてご連絡ください。
        </Text>
      </Stack>
      <Link href="/contact" color="teal.700" fontWeight="bold" display="inline-flex" alignItems="center" gap={2}>
        お問い合わせ
        <LuArrowRight aria-hidden />
      </Link>
    </Stack>
  );
}

function groupEntriesByCategory(
  entries: FaqEntry[],
): Array<{ category: (typeof FAQ_CATEGORIES)[number]; entries: FaqEntry[] }> {
  return FAQ_CATEGORIES.map((category) => ({
    category,
    entries: entries.filter((entry) => entry.category === category.id),
  })).filter(({ entries: categoryEntries }) => categoryEntries.length > 0);
}
