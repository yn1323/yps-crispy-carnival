import {
  Accordion,
  Badge,
  Box,
  Container,
  Flex,
  Grid,
  Heading,
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
  const [selectedTaskId, setSelectedTaskId] = useState<HelpTaskId | null>(null);
  const hasQuery = query.trim().length > 0;
  const results = useMemo(() => searchHelpMetas(metas, query), [metas, query]);
  const faqContentById = useMemo(() => new Map(faqContents.map((entry) => [entry.meta.id, entry])), [faqContents]);
  const taskByHashId = useMemo(() => new Map(tasks.map((task) => [`task-${task.id}`, task])), [tasks]);
  const metadataById = useMemo(() => new Map(metas.map((meta) => [meta.id, meta])), [metas]);

  useEffect(() => {
    const openHashTarget = () => {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }

      const task = taskByHashId.get(id);
      if (task) {
        setQuery("");
        setSelectedTaskId(task.id);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
        });
        return;
      }

      const faqEntry = faqContentById.get(id);
      if (!faqEntry) return;

      setQuery("");
      setSelectedTaskId(faqEntry.meta.task);
      setOpenItems((current) => (current.includes(id) ? current : [...current, id]));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({ block: "start" });
          document.getElementById(`${id}-trigger`)?.focus({ preventScroll: true });
        });
      });
    };

    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
    return () => window.removeEventListener("hashchange", openHashTarget);
  }, [faqContentById, taskByHashId]);

  const clearSearch = () => {
    setQuery("");
    requestAnimationFrame(() => document.getElementById("help-search")?.focus());
  };

  const selectTask = (taskId: HelpTaskId) => {
    clearLocationHash();
    setSelectedTaskId((current) => (current === taskId ? null : taskId));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => document.getElementById("help-browse-content")?.scrollIntoView({ block: "start" }));
    });
  };

  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 6, lg: 10 }}>
        <HelpHeader query={query} onQueryChange={setQuery} />
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
              selectedTaskId={selectedTaskId}
              onSelectTask={selectTask}
            />
          )}
        </Accordion.Root>
        <HelpSupport />
      </Container>
    </PublicPageLayout>
  );
}

function clearLocationHash() {
  if (!window.location.hash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function HelpHeader({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  return (
    <Stack gap={3} maxW="760px" mb={{ base: 8, lg: 10 }}>
      <Heading as="h1" color="gray.950" fontSize={{ base: "2xl", lg: "3xl" }} letterSpacing="0">
        ヘルプ
      </Heading>
      <Text color="gray.700" lineHeight="1.7">
        キーワードとやりたいことから検索できます。
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

function DefaultHelpContent({
  tasks,
  metas,
  faqContentById,
  metadataById,
  selectedTaskId,
  onSelectTask,
}: {
  tasks: readonly HelpTask[];
  metas: readonly HelpMetadata[];
  faqContentById: ReadonlyMap<string, HelpFaqContent>;
  metadataById: ReadonlyMap<string, HelpMetadata>;
  selectedTaskId: HelpTaskId | null;
  onSelectTask: (taskId: HelpTaskId) => void;
}) {
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const selectedTaskMetas = selectedTask ? metas.filter((meta) => meta.task === selectedTask.id) : [];
  const selectedTaskFaqs = selectedTaskMetas
    .filter((meta) => meta.kind === "faq")
    .map((meta) => faqContentById.get(meta.id))
    .filter((entry): entry is HelpFaqContent => Boolean(entry));
  const selectedTaskGuides = selectedTaskMetas.filter((meta): meta is GuideMetadata => meta.kind === "guide");
  const featuredFaqs = metas
    .filter((meta) => meta.kind === "faq" && meta.homeFeatured)
    .slice(0, 6)
    .map((meta) => faqContentById.get(meta.id))
    .filter((entry): entry is HelpFaqContent => Boolean(entry));
  const featuredGuideIds = new Set(
    featuredFaqs
      .map((entry) => entry.meta.primaryGuide)
      .filter((primaryGuide): primaryGuide is string => Boolean(primaryGuide)),
  );
  const featuredGuides = [...featuredGuideIds]
    .map((id) => metadataById.get(id))
    .filter((meta): meta is GuideMetadata => meta?.kind === "guide");

  return (
    <Stack gap={{ base: 10, lg: 14 }}>
      <Box as="section" aria-labelledby="help-tasks-title">
        <Stack gap={1} mb={5}>
          <Heading id="help-tasks-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
            やりたいことから探す
          </Heading>
        </Stack>
        <SimpleGrid columns={{ base: 2, lg: 3 }} gap={{ base: 2.5, md: 3 }}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              selected={task.id === selectedTaskId}
              onSelect={() => onSelectTask(task.id)}
            />
          ))}
        </SimpleGrid>
      </Box>

      <Box id="help-browse-content" scrollMarginTop={`calc(${HEADER_HEIGHT.md} + 24px)`}>
        {selectedTask ? (
          <TaskSection
            task={selectedTask}
            faqs={selectedTaskFaqs}
            guides={selectedTaskGuides}
            metadataById={metadataById}
          />
        ) : (
          <RecommendedHelp faqs={featuredFaqs} guides={featuredGuides} metadataById={metadataById} />
        )}
      </Box>
    </Stack>
  );
}

function TaskCard({ task, selected, onSelect }: { task: HelpTask; selected: boolean; onSelect: () => void }) {
  const TaskIcon = TASK_ICONS[task.id];

  return (
    <Button
      type="button"
      variant="outline"
      colorPalette="gray"
      aria-label={task.title}
      aria-pressed={selected}
      aria-controls="help-browse-content"
      onClick={onSelect}
      display="flex"
      alignItems="flex-start"
      justifyContent="flex-start"
      gap={3}
      h="auto"
      minH={{ base: "112px", md: "148px" }}
      p={{ base: 3, md: 4 }}
      position="relative"
      borderWidth="1px"
      borderColor={selected ? "teal.500" : "gray.200"}
      borderRadius="lg"
      color="gray.950"
      bg={selected ? "teal.50" : "white"}
      whiteSpace="normal"
      textAlign="left"
      _hover={
        selected
          ? { borderColor: "teal.600", bg: "teal.100" }
          : { borderColor: "gray.400", bg: "gray.50", boxShadow: "sm" }
      }
    >
      {selected && (
        <Badge
          position="absolute"
          top={-2}
          insetEnd={-1}
          zIndex={1}
          colorPalette="teal"
          variant="solid"
          borderRadius="full"
          px={2}
          aria-hidden="true"
        >
          選択中
        </Badge>
      )}
      <Flex align="center" justify="center" boxSize={{ base: 9, md: 10 }} flexShrink={0} borderRadius="lg" bg="teal.50">
        <TaskIcon aria-hidden color="var(--chakra-colors-teal-800)" />
      </Flex>
      <Stack gap={1} minW={0}>
        <HelpAudienceBadge audience={task.audience} />
        <Text fontWeight="bold" lineHeight="1.5" fontSize={{ base: "sm", md: "md" }}>
          {task.title}
        </Text>
        <Text hideBelow="md" color="gray.600" fontSize="sm" lineHeight="1.6" lineClamp={2}>
          {task.description}
        </Text>
      </Stack>
    </Button>
  );
}

function RecommendedHelp({
  faqs,
  guides,
  metadataById,
}: {
  faqs: HelpFaqContent[];
  guides: GuideMetadata[];
  metadataById: ReadonlyMap<string, HelpMetadata>;
}) {
  return (
    <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={{ base: 9, lg: 8 }}>
      {faqs.length > 0 && (
        <Box as="section" aria-labelledby="featured-faqs-title">
          <Heading id="featured-faqs-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }} mb={4}>
            よくある質問
          </Heading>
          <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
            {faqs.map((entry) => (
              <FaqItem key={entry.meta.id} entry={entry} metadataById={metadataById} />
            ))}
          </Stack>
        </Box>
      )}
      {guides.length > 0 && (
        <Box as="section" aria-labelledby="featured-guides-title">
          <Heading id="featured-guides-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }} mb={4}>
            手順から探す
          </Heading>
          <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
            {guides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </Stack>
        </Box>
      )}
    </Grid>
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
      <Stack gap={3} mb={5}>
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
            <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
              {faqs.map((entry) => (
                <FaqItem key={entry.meta.id} entry={entry} metadataById={metadataById} />
              ))}
            </Stack>
          </Stack>
        )}
        {guides.length > 0 && (
          <Stack gap={3}>
            <Text color="gray.700" fontSize="sm" fontWeight="bold">
              詳しい使い方
            </Text>
            <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
              {guides.map((guide) => (
                <GuideCard key={guide.id} guide={guide} />
              ))}
            </Stack>
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
              <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
                {faqs.map((entry) => (
                  <FaqItem key={entry.meta.id} entry={entry} metadataById={metadataById} />
                ))}
              </Stack>
            </Stack>
          )}
          {guides.length > 0 && (
            <Stack gap={3}>
              <Heading as="h2" color="gray.950" fontSize="xl">
                詳しい使い方（{guides.length}件）
              </Heading>
              <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
                {guides.map((guide) => (
                  <GuideCard key={guide.id} guide={guide} />
                ))}
              </Stack>
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
      borderBottomWidth="1px"
      borderColor="gray.200"
      bg="white"
      overflow="hidden"
      _last={{ borderBottomWidth: 0 }}
    >
      <Heading as="h3" fontSize="inherit" fontWeight="normal">
        <Accordion.ItemTrigger
          id={`${meta.id}-trigger`}
          alignItems="center"
          gap={3}
          px={{ base: 4, md: 5 }}
          py={3.5}
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
      borderBottomWidth="1px"
      borderColor="gray.200"
      color="gray.950"
      bg="white"
      _hover={{ bg: "gray.50", textDecoration: "none" }}
      _last={{ borderBottomWidth: 0 }}
    >
      <Stack gap={2} minW={0}>
        <HelpAudienceBadge audience={guide.audience} />
        <Text fontWeight="bold" lineHeight="1.6">
          {guide.title}
        </Text>
        <Text color="gray.600" fontSize="sm" lineHeight="1.7" lineClamp={1}>
          {guide.summary}
        </Text>
      </Stack>
      <LuArrowRight aria-hidden color="var(--chakra-colors-teal-700)" />
    </Link>
  );
}
