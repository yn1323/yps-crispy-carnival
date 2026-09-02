import { Box, Heading, Link, List, Text, VStack } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import type { LegalDocumentContent, LegalMdxComponents } from "./legalContent";

type LegalPageProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalPage({ title, lastUpdated, children }: LegalPageProps): ReactNode {
  return (
    <PublicPageLayout mainProps={{ pt: 0 }}>
      <VStack
        mx="auto"
        w="full"
        maxW="7xl"
        px={{ base: 4, md: 6, lg: 8 }}
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
    </PublicPageLayout>
  );
}

type LegalMarkdownPageProps = {
  content: LegalDocumentContent;
  components?: LegalMdxComponents;
  contentGap?: ComponentProps<typeof VStack>["gap"];
  children?: ReactNode;
};

export function LegalMarkdownPage({
  content,
  components,
  contentGap = 3,
  children,
}: LegalMarkdownPageProps): ReactNode {
  return (
    <LegalPage title={content.title} lastUpdated={content.lastUpdated}>
      <VStack gap={contentGap} align="stretch">
        <content.Content components={{ ...legalMdxComponents, ...components }} />
        {children}
      </VStack>
    </LegalPage>
  );
}

type LegalDocumentPageProps = {
  content: LegalDocumentContent;
  info: {
    documentVersion: string;
  };
};

export function LegalDocumentPage({ content, info }: LegalDocumentPageProps): ReactNode {
  return (
    <LegalMarkdownPage content={content}>
      <Body>文書バージョン：{info.documentVersion}</Body>
    </LegalMarkdownPage>
  );
}

/** h2をセクション見出しとして扱い、見出し前の余白でセクション区切りを表現する */
const legalMdxComponents = {
  h2: (props: ComponentProps<"h2">) => (
    <Heading as="h2" textStyle="sectionTitle" color="teal.700" mt={{ base: 3, lg: 5 }} {...props} />
  ),
  h3: (props: ComponentProps<"h3">) => <Text as="h3" textStyle="lg" fontWeight="bold" color="fg" {...props} />,
  p: (props: ComponentProps<"p">) => <Body {...props} />,
  a: (props: ComponentProps<"a">) => <Link color="teal.700" {...props} />,
  strong: (props: ComponentProps<"strong">) => <Box as="strong" color="fg" fontWeight="bold" {...props} />,
  ul: (props: ComponentProps<"ul">) => (
    <List.Root as="ul" gap={2} ps={5} textStyle="bodySm" color="fg.muted" {...props} />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <List.Root as="ol" gap={2} ps={5} textStyle="bodySm" color="fg.muted" {...props} />
  ),
  li: (props: ComponentProps<"li">) => <List.Item lineHeight={1.8} {...props} />,
} satisfies LegalMdxComponents;

function Body(props: ComponentProps<"p">): ReactNode {
  return <Text as="p" textStyle="bodySm" color="fg.muted" lineHeight={1.8} {...props} />;
}
