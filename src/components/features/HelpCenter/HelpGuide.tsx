import { Accordion, Box, Container, Grid, Heading, HStack, Link, Stack, Text, VStack } from "@chakra-ui/react";
import { type ComponentType, type LazyExoticComponent, lazy, Suspense, useMemo } from "react";
import { LuArrowLeft, LuArrowRight, LuBookOpen, LuCircleHelp } from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Empty } from "@/src/components/ui/Empty";
import { type HelpGuideContent, loadGuideContent } from "./guideContent";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpSupport } from "./HelpSupport";
import {
  type FaqMetadata,
  type GuideMetadata,
  getGuideMeta,
  getRelatedHelpMetas,
  type HelpMetadata,
  helpMetas,
} from "./helpMeta";
import { getHelpTask, getHelpTaskHref, type HelpTaskId } from "./helpTasks";
import { createHelpMdxComponents } from "./mdxComponents";

export type HelpGuideProps = {
  slug?: string;
  guide?: HelpGuideContent;
  metas?: readonly HelpMetadata[];
};

export function HelpGuide({ slug, guide: injectedGuide, metas = helpMetas }: HelpGuideProps) {
  if (injectedGuide) return <HelpGuideView guide={injectedGuide} metas={metas} />;
  if (!slug || !getGuideMeta(slug)) return <HelpGuideNotFound />;

  const LazyGuide = getLazyGuideComponent(slug);
  return (
    <Suspense fallback={<HelpGuideLoading />}>
      <LazyGuide metas={metas} />
    </Suspense>
  );
}

type LazyGuideProps = { metas: readonly HelpMetadata[] };

const lazyGuideComponents = new Map<string, LazyExoticComponent<ComponentType<LazyGuideProps>>>();

function getLazyGuideComponent(slug: string): LazyExoticComponent<ComponentType<LazyGuideProps>> {
  const cached = lazyGuideComponents.get(slug);
  if (cached) return cached;

  const LazyGuide = lazy(async () => {
    const guide = await loadGuideContent(slug);
    return {
      default({ metas }: LazyGuideProps) {
        return guide ? <HelpGuideView guide={guide} metas={metas} /> : <HelpGuideNotFound />;
      },
    };
  });
  lazyGuideComponents.set(slug, LazyGuide);
  return LazyGuide;
}

function HelpGuideView({ guide, metas }: { guide: HelpGuideContent; metas: readonly HelpMetadata[] }) {
  const shouldShowToc = guide.toc.length >= 3;
  const task = getHelpTask(guide.meta.task);
  const relatedFaqs = getRelatedFaqs(guide, metas);
  const relatedGuides = getRelatedGuides(guide, metas);

  return (
    <PublicPageLayout>
      <Box borderBottomWidth="1px" borderColor="gray.200" bg="gray.50/60">
        <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 7, lg: 10 }}>
          <Stack gap={5} maxW="800px">
            <HelpBreadcrumbs taskTitle={task?.title} taskId={task?.id} title={guide.meta.title} />
            <Stack gap={3} align="flex-start">
              <HelpAudienceBadge audience={guide.meta.audience} />
              <Heading
                id="help-guide-title"
                as="h1"
                color="gray.950"
                fontSize={{ base: "3xl", lg: "4xl" }}
                lineHeight="1.4"
                letterSpacing="0"
                textWrap="balance"
              >
                {guide.meta.title}
              </Heading>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container
        maxW={{ base: "720px", xl: shouldShowToc ? "1200px" : "720px" }}
        px={{ base: 4, lg: 8, xl: shouldShowToc ? 0 : 8 }}
        py={{ base: 8, lg: 14 }}
      >
        <Grid
          templateColumns={{
            base: "1fr",
            xl: shouldShowToc ? "minmax(0, 216px) minmax(0, 720px) minmax(0, 216px)" : "minmax(0, 720px)",
          }}
          justifyContent="center"
          columnGap={{ xl: 6 }}
          alignItems="start"
        >
          {shouldShowToc && <DesktopHelpToc guide={guide} />}
          <Stack
            gridColumn={{ base: "1", xl: shouldShowToc ? "2" : "1" }}
            gap={{ base: 10, lg: 14 }}
            minW={0}
            w="full"
            maxW="720px"
          >
            {shouldShowToc && <MobileHelpToc guide={guide} />}
            <HelpGuideBody guide={guide} />
            {(relatedFaqs.length > 0 || relatedGuides.length > 0) && (
              <RelatedHelp faqs={relatedFaqs} guides={relatedGuides} />
            )}
            <HelpSupport />
          </Stack>
        </Grid>
      </Container>
    </PublicPageLayout>
  );
}

function HelpGuideLoading() {
  return (
    <PublicPageLayout>
      <Container maxW="720px" px={4} py={{ base: 12, lg: 20 }}>
        <Text role="status" color="gray.600">
          ヘルプを読み込んでいます
        </Text>
      </Container>
    </PublicPageLayout>
  );
}

function HelpGuideBody({ guide }: { guide: HelpGuideContent }) {
  const components = useMemo(
    () => createHelpMdxComponents(guide.resolveImageSrc, guide.resolveVideoSrc),
    [guide.resolveImageSrc, guide.resolveVideoSrc],
  );

  return (
    <VStack as="article" aria-labelledby="help-guide-title" align="stretch" gap={4}>
      <guide.Content components={components} />
    </VStack>
  );
}

function HelpBreadcrumbs({ taskTitle, taskId, title }: { taskTitle?: string; taskId?: HelpTaskId; title: string }) {
  return (
    <HStack as="nav" aria-label="パンくず" gap={2} wrap="wrap" color="gray.600" fontSize="sm">
      <Link href="/help" color="teal.700" fontWeight="semibold">
        ヘルプ・使い方
      </Link>
      <Text aria-hidden>/</Text>
      {taskTitle && taskId && (
        <>
          <Link href={getHelpTaskHref(taskId)} color="teal.700" fontWeight="semibold">
            {taskTitle}
          </Link>
          <Text aria-hidden>/</Text>
        </>
      )}
      <Text color="gray.700" lineClamp={1}>
        {title}
      </Text>
    </HStack>
  );
}

function DesktopHelpToc({ guide }: { guide: HelpGuideContent }) {
  return (
    <VStack
      as="nav"
      aria-label="この使い方の目次"
      align="stretch"
      gap={4}
      display={{ base: "none", xl: "flex" }}
      gridColumn={{ xl: "1" }}
      justifySelf={{ xl: "end" }}
      w="full"
      maxW="216px"
      position={{ base: "static", xl: "sticky" }}
      top={{ xl: `calc(${HEADER_HEIGHT.md} + 24px)` }}
      maxH={{ xl: `calc(100vh - ${HEADER_HEIGHT.md} - 48px)` }}
      overflowY={{ xl: "auto" }}
      borderLeftWidth="2px"
      borderColor="gray.200"
      py={1}
      ps={4}
      pe={2}
    >
      <Text fontWeight="bold" color="gray.800" fontSize="sm">
        この使い方の目次
      </Text>
      <Stack gap={2}>
        {guide.toc.map((item) => (
          <Link
            key={item.id}
            href={`#${item.id}`}
            color="gray.700"
            fontSize="sm"
            lineHeight="1.7"
            _hover={{ color: "teal.800", textDecoration: "none" }}
          >
            {item.text}
          </Link>
        ))}
      </Stack>
    </VStack>
  );
}

function MobileHelpToc({ guide }: { guide: HelpGuideContent }) {
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
        <Accordion.ItemTrigger px={4} py={3} cursor="pointer" _hover={{ bg: "gray.50" }}>
          <HStack flex="1" justify="space-between">
            <Text fontWeight="bold" color="gray.950">
              この使い方の目次
            </Text>
            <Accordion.ItemIndicator color="teal.700" />
          </HStack>
        </Accordion.ItemTrigger>
        <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
          <Accordion.ItemBody px={4} py={3}>
            <Stack as="nav" aria-label="この使い方の目次" gap={2}>
              {guide.toc.map((item) => (
                <Link
                  key={item.id}
                  href={`#${item.id}`}
                  color="teal.700"
                  fontSize="sm"
                  lineHeight="1.7"
                  display="flex"
                  alignItems="center"
                  minH={10}
                >
                  {item.text}
                </Link>
              ))}
            </Stack>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}

function RelatedHelp({ faqs, guides }: { faqs: FaqMetadata[]; guides: GuideMetadata[] }) {
  return (
    <Box as="section" aria-labelledby="related-help-title" pt={8} borderTopWidth="1px" borderColor="gray.200">
      <Heading id="related-help-title" as="h2" color="gray.950" fontSize={{ base: "xl", md: "2xl" }} mb={5}>
        関連するヘルプ
      </Heading>
      <Grid templateColumns={{ base: "1fr", md: faqs.length > 0 && guides.length > 0 ? "1fr 1fr" : "1fr" }} gap={6}>
        {faqs.length > 0 && (
          <Stack gap={3}>
            <Text color="gray.700" fontSize="sm" fontWeight="bold">
              よくある質問
            </Text>
            {faqs.map((faq) => (
              <RelatedLink key={faq.id} href={faq.href} title={faq.title} icon={LuCircleHelp} />
            ))}
          </Stack>
        )}
        {guides.length > 0 && (
          <Stack gap={3}>
            <Text color="gray.700" fontSize="sm" fontWeight="bold">
              詳しい使い方
            </Text>
            {guides.map((guide) => (
              <RelatedLink key={guide.id} href={guide.href} title={guide.title} icon={LuBookOpen} />
            ))}
          </Stack>
        )}
      </Grid>
    </Box>
  );
}

function RelatedLink({ href, title, icon: RelatedIcon }: { href: string; title: string; icon: typeof LuBookOpen }) {
  return (
    <Link
      href={href}
      display="flex"
      alignItems="center"
      gap={3}
      minH={14}
      px={4}
      py={3}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      color="gray.950"
      fontWeight="semibold"
      lineHeight="1.6"
      _hover={{ bg: "gray.50", borderColor: "gray.300", textDecoration: "none" }}
    >
      <RelatedIcon aria-hidden color="var(--chakra-colors-teal-700)" />
      <Text flex="1">{title}</Text>
      <LuArrowRight aria-hidden color="var(--chakra-colors-gray-500)" />
    </Link>
  );
}

function HelpGuideNotFound() {
  return (
    <PublicPageLayout>
      <Container maxW="720px" px={4} py={{ base: 12, lg: 20 }}>
        <Empty
          icon={LuCircleHelp}
          title="ヘルプが見つかりません"
          titleAs="h1"
          action={
            <Link href="/help" color="teal.700" fontWeight="bold" display="inline-flex" alignItems="center" gap={2}>
              <LuArrowLeft aria-hidden />
              ヘルプ・使い方へ戻る
            </Link>
          }
          size="lg"
          minH="360px"
        />
      </Container>
    </PublicPageLayout>
  );
}

function getRelatedFaqs(guide: HelpGuideContent, metas: readonly HelpMetadata[]): FaqMetadata[] {
  const relatedIds = new Set(getRelatedHelpMetas(guide.meta, metas).map((meta) => meta.id));

  return metas
    .filter(
      (meta): meta is FaqMetadata =>
        meta.kind === "faq" && (meta.primaryGuide === guide.meta.id || relatedIds.has(meta.id)),
    )
    .slice(0, 4);
}

function getRelatedGuides(guide: HelpGuideContent, metas: readonly HelpMetadata[]): GuideMetadata[] {
  const relatedIds = new Set(getRelatedHelpMetas(guide.meta, metas).map((meta) => meta.id));
  const direct = metas.filter(
    (meta): meta is GuideMetadata => meta.kind === "guide" && meta.id !== guide.meta.id && relatedIds.has(meta.id),
  );
  const fallback = metas.filter(
    (meta): meta is GuideMetadata =>
      meta.kind === "guide" &&
      meta.id !== guide.meta.id &&
      meta.task === guide.meta.task &&
      !direct.some((candidate) => candidate.id === meta.id),
  );

  return [...direct, ...fallback].slice(0, 3);
}
