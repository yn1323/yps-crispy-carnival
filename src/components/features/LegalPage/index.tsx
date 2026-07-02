import { Box, Heading, Link, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { LegalDocumentInfo } from "@/convex/legal/documents";
import { FooterSection } from "@/src/components/features/LandingPage/FooterSection";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import type { MarkdownBlock } from "@/src/helpers/markdown";
import type { LegalDocumentContent, LegalSection } from "./legalContent";

type LegalPageProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalPage({ title, lastUpdated, children }: LegalPageProps): ReactNode {
  return (
    <Box bg="white" minH="100vh" color="fg">
      <Header variant="public" showLinks={false} showLogin={false} />
      <VStack
        mx="auto"
        w="full"
        maxW="768px"
        px={{ base: 4, lg: 12 }}
        pt={{ base: `calc(${HEADER_HEIGHT.base} + 32px)`, lg: `calc(${HEADER_HEIGHT.md} + 48px)` }}
        pb={{ base: 12, lg: 24 }}
        gap={{ base: 6, lg: 8 }}
        align="stretch"
        textAlign="left"
      >
        <Heading as="h1" textStyle="pageTitle" color="fg">
          {title}
        </Heading>
        <Text fontSize="sm" color="fg.subtle">
          最終更新日：{lastUpdated}
        </Text>
        {children}
      </VStack>
      <FooterSection />
    </Box>
  );
}

type LegalDocumentPageProps = {
  content: LegalDocumentContent;
  info: LegalDocumentInfo;
};

export function LegalDocumentPage({ content, info }: LegalDocumentPageProps): ReactNode {
  return (
    <LegalPage title={content.title} lastUpdated={content.lastUpdated}>
      {content.sections.map((section, index) => (
        <LegalSectionView key={section.title ?? index} section={section} />
      ))}
      <Body>文書バージョン: {info.documentVersion}</Body>
    </LegalPage>
  );
}

function LegalSectionView({ section }: { section: LegalSection }): ReactNode {
  const blocks = section.blocks.map((block, index) => <LegalBlock key={`${block.type}-${index}`} block={block} />);

  if (section.title === undefined) {
    return <>{blocks}</>;
  }

  return <Section title={section.title}>{blocks}</Section>;
}

function LegalBlock({ block }: { block: MarkdownBlock }): ReactNode {
  switch (block.type) {
    case "heading":
      return <SubHeading>{block.text}</SubHeading>;
    case "paragraph":
    case "blockquote":
      return <Body>{renderInlineText(block.text)}</Body>;
    case "unorderedList":
    case "orderedList":
      return <BulletList items={block.items} ordered={block.type === "orderedList"} />;
    default:
      return null;
  }
}

function renderInlineText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [token, linkLabel, linkHref, boldText] = match;
    const key = `${token}-${match.index}`;

    if (linkLabel && linkHref) {
      nodes.push(
        <Link key={key} href={linkHref} color="teal.700">
          {linkLabel}
        </Link>,
      );
    } else if (boldText) {
      nodes.push(
        <Box as="strong" key={key} color="fg" fontWeight="bold">
          {boldText}
        </Box>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

type SectionProps = { title: string; children: ReactNode };

export function Section({ title, children }: SectionProps): ReactNode {
  return (
    <VStack gap={3} align="stretch">
      <Heading as="h2" textStyle="sectionTitle" color="teal.700">
        {title}
      </Heading>
      {children}
    </VStack>
  );
}

type SubHeadingProps = { children: ReactNode };

export function SubHeading({ children }: SubHeadingProps): ReactNode {
  return (
    <Text textStyle="lg" fontWeight="bold" color="fg">
      {children}
    </Text>
  );
}

type BodyProps = { children: ReactNode };

export function Body({ children }: BodyProps): ReactNode {
  return (
    <Text textStyle="bodySm" color="fg.muted" lineHeight={1.8}>
      {children}
    </Text>
  );
}

type BulletListProps = { items: string[]; ordered?: boolean };

export function BulletList({ items, ordered = false }: BulletListProps): ReactNode {
  return (
    <VStack as={ordered ? "ol" : "ul"} align="stretch" gap={2} pl={5} listStyleType={ordered ? "decimal" : "disc"}>
      {items.map((item) => (
        <Text as="li" key={item} textStyle="bodySm" color="fg.muted" lineHeight={1.8}>
          {renderInlineText(item)}
        </Text>
      ))}
    </VStack>
  );
}
