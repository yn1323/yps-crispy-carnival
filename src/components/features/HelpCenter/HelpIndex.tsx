import {
  Accordion,
  Box,
  Container,
  Flex,
  Grid,
  Heading,
  Icon,
  Input,
  Link,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { type ElementType, useEffect, useMemo, useState } from "react";
import {
  LuArrowRight,
  LuBell,
  LuBuilding2,
  LuCalendarCheck2,
  LuCircleHelp,
  LuClipboardPen,
  LuMegaphone,
  LuRocket,
  LuSearch,
  LuStore,
  LuUsers,
} from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { faqEntries, type HelpFaqContent } from "./faqContent";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpSupport } from "./HelpSupport";
import { type GuideIndexMetadata, type HelpIndexMetadata, helpIndexMetas } from "./helpIndexData";
import { type GuideMetadata, getGuideMeta, getRelatedHelpMetas, type HelpMetadata } from "./helpMeta";
import { searchHelpMetas } from "./helpSearch";
import { HELP_TASKS, type HelpTask, type HelpTaskId } from "./helpTasks";
import { createHelpMdxComponents } from "./mdxComponents";

const faqMdxComponents = createHelpMdxComponents();

const TASK_ICONS: Record<HelpTaskId, ElementType> = {
  "getting-started": LuRocket,
  "shop-settings": LuStore,
  "staff-management": LuUsers,
  "shift-recruitment": LuMegaphone,
  "shift-submission": LuClipboardPen,
  "shift-building": LuCalendarCheck2,
  notifications: LuBell,
  "organization-billing": LuBuilding2,
  troubleshooting: LuCircleHelp,
};

export type HelpIndexProps = {
  metas?: readonly HelpIndexMetadata[];
  faqContents?: readonly HelpFaqContent[];
  tasks?: readonly HelpTask[];
};

export function HelpIndex({ metas = helpIndexMetas, faqContents = faqEntries, tasks = HELP_TASKS }: HelpIndexProps) {
  const [query, setQuery] = useState("");
  const [openItems, setOpenItems] = useState<string[]>([]);
  const hasQuery = query.trim().length > 0;
  const results = useMemo(() => searchHelpMetas(metas, query), [metas, query]);
  const faqContentById = useMemo(() => new Map(faqContents.map((entry) => [entry.meta.id, entry])), [faqContents]);
  const metadataById = useMemo(() => new Map(metas.map((meta) => [meta.id, meta])), [metas]);

  useEffect(() => {
    const openHashFaq = () => {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!faqContentById.has(id)) return;

      setQuery("");
      setOpenItems((current) => (current.includes(id) ? current : [...current, id]));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({ block: "start" });
          document.getElementById(`${id}-trigger`)?.focus({ preventScroll: true });
        });
      });
    };

    openHashFaq();
    window.addEventListener("hashchange", openHashFaq);
    return () => window.removeEventListener("hashchange", openHashFaq);
  }, [faqContentById]);

  const clearSearch = () => {
    setQuery("");
    requestAnimationFrame(() => document.getElementById("help-search")?.focus());
  };

  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <HelpHero query={query} onQueryChange={setQuery} />
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 14 }}>
        <Accordion.Root
          collapsible
          multiple
          value={openItems}
          onValueChange={({ value }) => setOpenItems(value)}
          variant="plain"
        >
          {hasQuery ? (
            <SearchResults
              results={results}
              faqContentById={faqContentById}
              metadataById={metadataById}
              query={query}
              onClear={clearSearch}
            />
          ) : (
            <DefaultHelpContent
              tasks={tasks}
              metas={metas}
              faqContentById={faqContentById}
              metadataById={metadataById}
            />
          )}
        </Accordion.Root>
        <HelpSupport />
      </Container>
    </PublicPageLayout>
  );
}

function HelpHero({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  return (
    <Box borderBottomWidth="1px" borderColor="gray.200" bg="gray.50/60">
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 7, lg: 11 }}>
        <Stack gap={4} maxW="720px">
          <Heading as="h1" color="gray.950" fontSize={{ base: "3xl", lg: "4xl" }} letterSpacing="0">
            ヘルプ
          </Heading>
          <Text color="gray.700" lineHeight="1.8">
            やりたいことから使い方を確認したり、困っていることをFAQから探したりできます。
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
              id="help-search"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              aria-label="ヘルプを検索"
              placeholder="例：スタッフを追加したい、通知が届かない"
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

function DefaultHelpContent({
  tasks,
  metas,
  faqContentById,
  metadataById,
}: {
  tasks: readonly HelpTask[];
  metas: readonly HelpMetadata[];
  faqContentById: ReadonlyMap<string, HelpFaqContent>;
  metadataById: ReadonlyMap<string, HelpMetadata>;
}) {
  return (
    <Stack gap={{ base: 14, lg: 20 }}>
      <Box as="section" aria-labelledby="help-tasks-title">
        <Heading id="help-tasks-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }} mb={5}>
          やりたいことから探す
        </Heading>
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={3}>
          {tasks.map((task) => {
            const taskMetas = metas.filter((meta) => meta.task === task.id);
            return (
              <TaskCard
                key={task.id}
                task={task}
                faqCount={taskMetas.filter((meta) => meta.kind === "faq").length}
                guideCount={taskMetas.filter((meta) => meta.kind === "guide").length}
              />
            );
          })}
        </SimpleGrid>
      </Box>

      <Stack gap={{ base: 14, lg: 18 }}>
        {tasks.map((task) => {
          const taskMetas = metas.filter((meta) => meta.task === task.id);
          const taskFaqs = taskMetas
            .filter((meta) => meta.kind === "faq")
            .map((meta) => faqContentById.get(meta.id))
            .filter((entry): entry is HelpFaqContent => Boolean(entry));
          const taskGuides = taskMetas.filter((meta): meta is GuideMetadata => meta.kind === "guide");

          if (taskFaqs.length === 0 && taskGuides.length === 0) return null;
          return (
            <TaskSection key={task.id} task={task} faqs={taskFaqs} guides={taskGuides} metadataById={metadataById} />
          );
        })}
      </Stack>
    </Stack>
  );
}

function TaskCard({ task, faqCount, guideCount }: { task: HelpTask; faqCount: number; guideCount: number }) {
  const TaskIcon = TASK_ICONS[task.id];

  return (
    <Link
      href={`#task-${task.id}`}
      display="flex"
      alignItems="flex-start"
      gap={3}
      minH="120px"
      p={4}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      color="gray.950"
      bg="white"
      _hover={{ borderColor: "gray.400", boxShadow: "sm", textDecoration: "none" }}
    >
      <Flex align="center" justify="center" boxSize={10} flexShrink={0} borderRadius="lg" bg="teal.100">
        <TaskIcon aria-hidden color="var(--chakra-colors-teal-800)" />
      </Flex>
      <Stack gap={1} minW={0}>
        <HelpAudienceBadge audience={task.audience} />
        <Text fontWeight="bold" lineHeight="1.6">
          {task.title}
        </Text>
        <Text color="gray.600" fontSize="sm" lineHeight="1.7">
          {task.description}
        </Text>
        <Text color="gray.500" fontSize="xs" fontWeight="semibold">
          関連ヘルプ {faqCount + guideCount}件
        </Text>
      </Stack>
    </Link>
  );
}

function TaskSection({
  task,
  faqs,
  guides,
  metadataById,
}: {
  task: HelpTask;
  faqs: HelpFaqContent[];
  guides: GuideMetadata[];
  metadataById: ReadonlyMap<string, HelpMetadata>;
}) {
  return (
    <Box
      as="section"
      id={`task-${task.id}`}
      scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}
      aria-labelledby={`task-${task.id}-title`}
    >
      <Stack gap={2} mb={5}>
        <Flex align="center" gap={2.5}>
          <HelpAudienceBadge audience={task.audience} />
          <Heading id={`task-${task.id}-title`} as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
            {task.title}
          </Heading>
        </Flex>
        <Text color="gray.600" lineHeight="1.7">
          {task.description}
        </Text>
      </Stack>

      <Grid templateColumns={{ base: "1fr", lg: faqs.length > 0 && guides.length > 0 ? "1fr 1fr" : "1fr" }} gap={6}>
        {faqs.length > 0 && (
          <Stack gap={3}>
            <Text color="gray.700" fontSize="sm" fontWeight="bold">
              よくある質問
            </Text>
            {faqs.map((entry) => (
              <FaqItem key={entry.meta.id} entry={entry} metadataById={metadataById} />
            ))}
          </Stack>
        )}
        {guides.length > 0 && (
          <Stack gap={3}>
            <Text color="gray.700" fontSize="sm" fontWeight="bold">
              詳しい使い方
            </Text>
            {guides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </Stack>
        )}
      </Grid>
    </Box>
  );
}

function SearchResults({
  results,
  faqContentById,
  metadataById,
  query,
  onClear,
}: {
  results: HelpIndexMetadata[];
  faqContentById: ReadonlyMap<string, HelpFaqContent>;
  metadataById: ReadonlyMap<string, HelpMetadata>;
  query: string;
  onClear: () => void;
}) {
  const faqs = results
    .filter((meta) => meta.kind === "faq")
    .map((meta) => faqContentById.get(meta.id))
    .filter((entry): entry is HelpFaqContent => Boolean(entry));
  const guides = results.filter((meta): meta is GuideIndexMetadata => meta.kind === "guide");

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
          {faqs.length > 0 && (
            <Stack gap={3}>
              <Heading as="h2" color="gray.950" fontSize="xl">
                よくある質問（{faqs.length}件）
              </Heading>
              {faqs.map((entry) => (
                <FaqItem key={entry.meta.id} entry={entry} metadataById={metadataById} />
              ))}
            </Stack>
          )}
          {guides.length > 0 && (
            <Stack gap={3}>
              <Heading as="h2" color="gray.950" fontSize="xl">
                詳しい使い方（{guides.length}件）
              </Heading>
              {guides.map((guide) => (
                <GuideCard key={guide.id} guide={guide} />
              ))}
            </Stack>
          )}
        </Grid>
      )}
    </Stack>
  );
}

function FaqItem({ entry, metadataById }: { entry: HelpFaqContent; metadataById: ReadonlyMap<string, HelpMetadata> }) {
  const { meta, Content } = entry;
  const relatedMetas = getRelatedHelpMetas(meta, [...metadataById.values()]).filter(
    (related) => related.id !== meta.primaryGuide,
  );

  return (
    <Accordion.Item
      id={meta.id}
      value={meta.id}
      scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      bg="white"
      overflow="hidden"
    >
      <Heading as="h3" fontSize="inherit" fontWeight="normal">
        <Accordion.ItemTrigger
          id={`${meta.id}-trigger`}
          alignItems="center"
          gap={3}
          px={{ base: 4, md: 5 }}
          py={4}
          cursor="pointer"
          textAlign="left"
          _hover={{ bg: "gray.50" }}
        >
          <Stack flex="1" minW={0} gap={2} align="flex-start">
            <HelpAudienceBadge audience={meta.audience} />
            <Text as="span" color="gray.950" fontWeight="bold" lineHeight="1.7">
              {meta.title}
            </Text>
          </Stack>
          <Accordion.ItemIndicator color="teal.700" flexShrink={0} />
        </Accordion.ItemTrigger>
      </Heading>
      <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
        <Accordion.ItemBody px={{ base: 4, md: 5 }} py={5}>
          <Stack gap={4}>
            <Content components={faqMdxComponents} />
            {meta.primaryGuide && (
              <Link
                href={`/help/${meta.primaryGuide}`}
                color="teal.700"
                fontWeight="bold"
                display="inline-flex"
                alignItems="center"
                alignSelf="flex-start"
                gap={2}
              >
                「{getGuideMeta(meta.primaryGuide)?.title ?? "関連する使い方"}」を見る
                <LuArrowRight aria-hidden />
              </Link>
            )}
            {relatedMetas.length > 0 && (
              <Stack gap={2} pt={3} borderTopWidth="1px" borderColor="gray.100">
                <Text color="gray.600" fontSize="sm" fontWeight="bold">
                  関連するヘルプ
                </Text>
                {relatedMetas.map((related) => (
                  <Link
                    key={related.id}
                    href={related.href}
                    color="teal.700"
                    fontSize="sm"
                    fontWeight="semibold"
                    display="inline-flex"
                    alignItems="center"
                    alignSelf="flex-start"
                    gap={2}
                  >
                    {related.title}
                    <LuArrowRight aria-hidden />
                  </Link>
                ))}
              </Stack>
            )}
          </Stack>
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  );
}

function GuideCard({ guide }: { guide: GuideMetadata }) {
  return (
    <Link
      href={guide.href}
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={4}
      minH="92px"
      p={4}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      color="gray.950"
      bg="white"
      _hover={{ bg: "gray.50", borderColor: "gray.300", textDecoration: "none" }}
    >
      <Stack gap={2} minW={0}>
        <HelpAudienceBadge audience={guide.audience} />
        <Text fontWeight="bold" lineHeight="1.6">
          {guide.title}
        </Text>
        <Text color="gray.600" fontSize="sm" lineHeight="1.7" lineClamp={2}>
          {guide.summary}
        </Text>
      </Stack>
      <LuArrowRight aria-hidden color="var(--chakra-colors-teal-700)" />
    </Link>
  );
}
