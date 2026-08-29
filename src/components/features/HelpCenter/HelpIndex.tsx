import { Box, Container, Flex, Grid, Heading, Input, Link, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { LuArrowRight, LuSearch } from "react-icons/lu";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpSupport } from "./HelpSupport";
import { HelpTaskLinkCard } from "./HelpTaskCard";
import { type HelpIndexMetadata, helpIndexMetas } from "./helpIndexData";
import { resolveLegacyHelpHash } from "./helpNavigation";
import { searchHelpMetas } from "./helpSearch";
import { HELP_TASKS, type HelpTask } from "./helpTasks";

export type HelpIndexProps = {
  metas?: readonly HelpIndexMetadata[];
  tasks?: readonly HelpTask[];
};

export function HelpIndex({ metas = helpIndexMetas, tasks = HELP_TASKS }: HelpIndexProps) {
  const [query, setQuery] = useState("");
  const hasQuery = query.trim().length > 0;
  const results = useMemo(() => searchHelpMetas(metas, query), [metas, query]);

  useEffect(() => {
    const replaceLegacyHash = () => {
      const target = resolveLegacyHelpHash(window.location.hash);
      if (target) window.location.replace(target);
    };

    replaceLegacyHash();
    window.addEventListener("hashchange", replaceLegacyHash);
    return () => window.removeEventListener("hashchange", replaceLegacyHash);
  }, []);

  const clearSearch = () => {
    setQuery("");
    requestAnimationFrame(() => document.getElementById("help-search")?.focus());
  };

  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 6, lg: 10 }}>
        <HelpHeader query={query} onQueryChange={setQuery} />
        {hasQuery ? (
          <SearchResults results={results} query={query} onClear={clearSearch} />
        ) : (
          <TaskLinks tasks={tasks} />
        )}
        <HelpSupport />
      </Container>
    </PublicPageLayout>
  );
}

function HelpHeader({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  return (
    <Stack gap={3} maxW="760px" mb={{ base: 8, lg: 10 }}>
      <Heading as="h1" color="gray.950" fontSize={{ base: "2xl", lg: "3xl" }} letterSpacing="0">
        ヘルプ
      </Heading>
      <Text color="gray.700" lineHeight="1.7">
        キーワードで検索するか、やりたいことを選んでください。
      </Text>
      <Box mt={1}>
        <Input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          aria-label="ヘルプを検索"
          placeholder="スタッフを追加したい、通知が届かない"
          h={{ base: 12, md: 14 }}
          pe={4}
          bg="white"
          borderColor="gray.300"
          borderRadius="lg"
          fontSize={{ md: "md" }}
          _focusVisible={{ borderColor: "teal.600", boxShadow: "0 0 0 1px var(--chakra-colors-teal-600)" }}
        />
      </Box>
    </Stack>
  );
}

function TaskLinks({ tasks }: { tasks: readonly HelpTask[] }) {
  return (
    <Box as="section" aria-labelledby="help-tasks-title">
      <Stack gap={1} mb={5}>
        <Heading id="help-tasks-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          やりたいことから探す
        </Heading>
        <Text color="gray.600" fontSize="sm" lineHeight="1.7">
          選んだ内容に合う、よくある質問と使い方をまとめて確認できます。
        </Text>
      </Stack>
      <SimpleGrid columns={{ base: 2, lg: 3 }} gap={{ base: 2.5, md: 3 }}>
        {tasks.map((task) => (
          <HelpTaskLinkCard key={task.id} task={task} />
        ))}
      </SimpleGrid>
    </Box>
  );
}

function SearchResults({
  results,
  query,
  onClear,
}: {
  results: HelpIndexMetadata[];
  query: string;
  onClear: () => void;
}) {
  const faqs = results.filter((meta) => meta.kind === "faq");
  const guides = results.filter((meta) => meta.kind === "guide");

  return (
    <Stack gap={7}>
      <Flex
        align={{ base: "flex-start", sm: "center" }}
        justify="space-between"
        gap={3}
        direction={{ base: "column", sm: "row" }}
      >
        <Text aria-live="polite" color="gray.700">
          「{query.trim()}」の検索結果：{results.length}件
        </Text>
        <Button type="button" variant="outline" size="sm" onClick={onClear}>
          検索をクリア
        </Button>
      </Flex>

      {results.length === 0 ? (
        <Empty
          icon={LuSearch}
          title="該当するヘルプが見つかりません"
          description="キーワードを短くするか、別の言い方で検索してください。"
          action={
            <Button type="button" variant="outline" onClick={onClear}>
              検索をクリア
            </Button>
          }
          variant="section"
          minH="280px"
        />
      ) : (
        <Grid templateColumns={{ base: "1fr", lg: faqs.length > 0 && guides.length > 0 ? "1fr 1fr" : "1fr" }} gap={8}>
          {faqs.length > 0 && <SearchResultGroup title={`よくある質問（${faqs.length}件）`} results={faqs} />}
          {guides.length > 0 && <SearchResultGroup title={`使い方（${guides.length}件）`} results={guides} />}
        </Grid>
      )}
    </Stack>
  );
}

function SearchResultGroup({ title, results }: { title: string; results: HelpIndexMetadata[] }) {
  return (
    <Stack as="section" gap={3} aria-label={title}>
      <Heading as="h2" color="gray.950" fontSize="xl">
        {title}
      </Heading>
      <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
        {results.map((result) => (
          <SearchResultLink key={result.id} result={result} />
        ))}
      </Stack>
    </Stack>
  );
}

function SearchResultLink({ result }: { result: HelpIndexMetadata }) {
  return (
    <Link
      href={result.href}
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={4}
      minH="104px"
      p={4}
      borderBottomWidth="1px"
      borderColor="gray.200"
      color="gray.950"
      bg="white"
      _hover={{ bg: "gray.50", textDecoration: "none" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
      _last={{ borderBottomWidth: 0 }}
    >
      <Stack gap={2} minW={0}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text color="gray.600" fontSize="xs" fontWeight="bold">
            {result.kind === "faq" ? "よくある質問" : "使い方"}
          </Text>
          <HelpAudienceBadge audience={result.audience} />
        </Flex>
        <Text fontWeight="bold" lineHeight="1.6">
          {result.title}
        </Text>
        <Text color="gray.600" fontSize="sm" lineHeight="1.7" lineClamp={2}>
          {result.summary}
        </Text>
      </Stack>
      <LuArrowRight aria-hidden color="var(--chakra-colors-teal-700)" />
    </Link>
  );
}
