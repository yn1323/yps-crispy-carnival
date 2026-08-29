import { Container, Grid, Heading, HStack, Link, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuArrowRight, LuCircleHelp } from "react-icons/lu";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Empty } from "@/src/components/ui/Empty";
import { faqEntries, type HelpFaqContent } from "./faqContent";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpFaqAccordion } from "./HelpFaqAccordion";
import { HelpSupport } from "./HelpSupport";
import { type GuideMetadata, type HelpMetadata, helpMetas } from "./helpMeta";
import { HELP_TASKS, type HelpTask as HelpTaskDefinition } from "./helpTasks";

export type HelpTaskProps = {
  taskId?: string;
  tasks?: readonly HelpTaskDefinition[];
  metas?: readonly HelpMetadata[];
  faqContents?: readonly HelpFaqContent[];
};

export function HelpTask({ taskId, tasks = HELP_TASKS, metas = helpMetas, faqContents = faqEntries }: HelpTaskProps) {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) return <HelpTaskNotFound />;

  return <HelpTaskView task={task} metas={metas} faqContents={faqContents} />;
}

function HelpTaskView({
  task,
  metas,
  faqContents,
}: {
  task: HelpTaskDefinition;
  metas: readonly HelpMetadata[];
  faqContents: readonly HelpFaqContent[];
}) {
  const [openItems, setOpenItems] = useState<string[]>([]);
  const taskMetas = useMemo(() => metas.filter((meta) => meta.task === task.id), [metas, task.id]);
  const faqById = useMemo(
    () => new Map(faqContents.filter((entry) => entry.meta.task === task.id).map((entry) => [entry.meta.id, entry])),
    [faqContents, task.id],
  );
  const faqs = useMemo(
    () =>
      taskMetas
        .filter((meta) => meta.kind === "faq")
        .map((meta) => faqById.get(meta.id))
        .filter((entry): entry is HelpFaqContent => Boolean(entry)),
    [faqById, taskMetas],
  );
  const guides = useMemo(() => taskMetas.filter((meta): meta is GuideMetadata => meta.kind === "guide"), [taskMetas]);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;

    const openHashTarget = () => {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }

      if (!faqById.has(id)) return;

      setOpenItems((current) => (current.includes(id) ? current : [...current, id]));
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({ block: "start" });
          document.getElementById(`${id}-trigger`)?.focus({ preventScroll: true });
        });
      });
    };

    setOpenItems([]);
    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
    return () => {
      window.removeEventListener("hashchange", openHashTarget);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [faqById]);

  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 6, lg: 10 }}>
        <Stack gap={{ base: 8, lg: 10 }}>
          <Stack gap={5} maxW="760px">
            <HStack as="nav" aria-label="パンくず" gap={2} wrap="wrap" color="gray.600" fontSize="sm">
              <Link href="/help" color="teal.700" fontWeight="semibold">
                ヘルプ
              </Link>
              <Text aria-hidden>/</Text>
              <Text color="gray.700" lineClamp={1}>
                {task.title}
              </Text>
            </HStack>

            <Stack gap={3} align="flex-start">
              <HelpAudienceBadge audience={task.audience} />
              <Heading
                id={`help-task-${task.id}-title`}
                as="h1"
                color="gray.950"
                fontSize={{ base: "2xl", lg: "3xl" }}
                lineHeight="1.4"
                letterSpacing="0"
                textWrap="balance"
                wordBreak="keep-all"
              >
                {task.title}
              </Heading>
              <Text color="gray.600" lineHeight="1.7">
                {task.description}
              </Text>
            </Stack>
          </Stack>

          <Grid
            templateColumns={{
              base: "1fr",
              lg: faqs.length > 0 && guides.length > 0 ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr",
            }}
            gap={{ base: 9, lg: 8 }}
            alignItems="start"
          >
            {faqs.length > 0 && (
              <Stack as="section" gap={4} aria-labelledby="help-task-faqs-title">
                <Stack gap={1}>
                  <Heading id="help-task-faqs-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
                    よくある質問
                  </Heading>
                  <Text color="gray.600" fontSize="sm" lineHeight="1.7">
                    質問を選ぶと、このページで回答を確認できます。
                  </Text>
                </Stack>
                <HelpFaqAccordion entries={faqs} metas={metas} value={openItems} onValueChange={setOpenItems} />
              </Stack>
            )}

            {guides.length > 0 && (
              <Stack as="section" gap={4} aria-labelledby="help-task-guides-title">
                <Stack gap={1}>
                  <Heading id="help-task-guides-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
                    使い方
                  </Heading>
                  <Text color="gray.600" fontSize="sm" lineHeight="1.7">
                    操作手順は、使い方の専用ページで詳しく確認できます。
                  </Text>
                </Stack>
                <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
                  {guides.map((guide) => (
                    <GuideLink key={guide.id} guide={guide} />
                  ))}
                </Stack>
              </Stack>
            )}
          </Grid>

          <Link
            href="/help"
            color="teal.700"
            fontWeight="bold"
            display="inline-flex"
            alignItems="center"
            alignSelf="flex-start"
            gap={2}
          >
            <LuArrowLeft aria-hidden />
            ほかのやりたいことを探す
          </Link>
        </Stack>
        <HelpSupport />
      </Container>
    </PublicPageLayout>
  );
}

function GuideLink({ guide }: { guide: GuideMetadata }) {
  return (
    <Link
      href={guide.href}
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

function HelpTaskNotFound() {
  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <Container maxW="720px" px={4} py={{ base: 12, lg: 20 }}>
        <Empty
          icon={LuCircleHelp}
          title="やりたいことが見つかりません"
          titleAs="h1"
          action={
            <Link href="/help" color="teal.700" fontWeight="bold" display="inline-flex" alignItems="center" gap={2}>
              <LuArrowLeft aria-hidden />
              ヘルプへ戻る
            </Link>
          }
          size="lg"
          minH="360px"
        />
      </Container>
    </PublicPageLayout>
  );
}
