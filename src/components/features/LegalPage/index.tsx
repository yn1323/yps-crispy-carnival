import { Box, Heading, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Footer, Nav } from "@/src/components/features/LandingPage";

type LegalPageProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalPage({ title, lastUpdated, children }: LegalPageProps): ReactNode {
  return (
    <Box bg="white" minH="100vh" color="fg">
      <Nav />
      <VStack
        mx="auto"
        w="full"
        maxW="768px"
        px={{ base: 4, lg: 12 }}
        py={{ base: 12, lg: 24 }}
        gap={{ base: 6, lg: 8 }}
        align="stretch"
        textAlign="left"
      >
        <Heading as="h1" fontSize={{ base: "24px", lg: "32px" }} color="fg" fontWeight="bold">
          {title}
        </Heading>
        <Text fontSize="sm" color="fg.subtle">
          最終更新日：{lastUpdated}
        </Text>
        {children}
      </VStack>
      <Footer />
    </Box>
  );
}

type SectionProps = { title: string; children: ReactNode };

export function Section({ title, children }: SectionProps): ReactNode {
  return (
    <VStack gap={3} align="stretch">
      <Heading as="h2" fontSize={{ base: "20px", lg: "24px" }} color="teal.700" fontWeight="bold">
        {title}
      </Heading>
      {children}
    </VStack>
  );
}

type SubHeadingProps = { children: ReactNode };

export function SubHeading({ children }: SubHeadingProps): ReactNode {
  return (
    <Text fontWeight="bold" fontSize={{ base: "16px", lg: "18px" }} color="fg">
      {children}
    </Text>
  );
}

type BodyProps = { children: ReactNode };

export function Body({ children }: BodyProps): ReactNode {
  return (
    <Text fontSize={{ base: "14px", lg: "15px" }} color="fg.muted" lineHeight={1.8}>
      {children}
    </Text>
  );
}

type BulletListProps = { items: string[] };

export function BulletList({ items }: BulletListProps): ReactNode {
  return (
    <VStack as="ul" align="stretch" gap={2} pl={5} listStyleType="disc">
      {items.map((item) => (
        <Text as="li" key={item} fontSize={{ base: "14px", lg: "15px" }} color="fg.muted" lineHeight={1.8}>
          {item}
        </Text>
      ))}
    </VStack>
  );
}
