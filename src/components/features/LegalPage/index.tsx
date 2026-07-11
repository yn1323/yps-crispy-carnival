import { Box, Heading, Link, List, Text, VStack } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";
import type { LegalDocumentInfo } from "@/convex/legal/documents";
import { FooterSection } from "@/src/components/features/LandingPage/FooterSection";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import type { LegalDocumentContent, LegalMdxComponents } from "./legalContent";

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
      <VStack gap={3} align="stretch">
        <content.Content components={legalMdxComponents} />
        <Body>文書バージョン：{info.documentVersion}</Body>
      </VStack>
    </LegalPage>
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
