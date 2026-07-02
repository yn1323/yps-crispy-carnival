import { Box, Heading, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { FooterSection } from "@/src/components/features/LandingPage/FooterSection";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";

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

type BulletListProps = { items: string[] };

export function BulletList({ items }: BulletListProps): ReactNode {
  return (
    <VStack as="ul" align="stretch" gap={2} pl={5} listStyleType="disc">
      {items.map((item) => (
        <Text as="li" key={item} textStyle="bodySm" color="fg.muted" lineHeight={1.8}>
          {item}
        </Text>
      ))}
    </VStack>
  );
}
