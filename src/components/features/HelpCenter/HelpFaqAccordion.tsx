import { Accordion, Heading, Link, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import type { HelpFaqContent } from "./faqContent";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { getGuideMeta, getRelatedHelpMetas, type HelpMetadata } from "./helpMeta";
import { createHelpMdxComponents } from "./mdxComponents";

const faqMdxComponents = createHelpMdxComponents();

export function HelpFaqAccordion({
  entries,
  metas,
  value,
  onValueChange,
}: {
  entries: readonly HelpFaqContent[];
  metas: readonly HelpMetadata[];
  value: string[];
  onValueChange: (value: string[]) => void;
}) {
  return (
    <Accordion.Root
      collapsible
      multiple
      value={value}
      onValueChange={({ value: nextValue }) => onValueChange(nextValue)}
      variant="plain"
    >
      <Stack gap={0} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
        {entries.map((entry) => (
          <FaqItem key={entry.meta.id} entry={entry} metas={metas} />
        ))}
      </Stack>
    </Accordion.Root>
  );
}

function FaqItem({ entry, metas }: { entry: HelpFaqContent; metas: readonly HelpMetadata[] }) {
  const { meta, Content } = entry;
  const relatedMetas = getRelatedHelpMetas(meta, metas).filter((related) => related.id !== meta.primaryGuide);

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
