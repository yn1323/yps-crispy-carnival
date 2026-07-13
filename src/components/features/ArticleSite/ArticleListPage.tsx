import { Box, Container, Flex, Grid, Heading, HStack, Link, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  LuBookOpen,
  LuCalendarCheck,
  LuChevronRight,
  LuFileSpreadsheet,
  LuMessageCircle,
  LuTable2,
} from "react-icons/lu";
import { ArticleConversionCta } from "./ArticleConversionCta";
import { ArticleBreadcrumbs, ArticleSiteShell } from "./ArticleSiteShell";
import { ArticleListSection } from "./ArticleSummary";
import { articles } from "./articleContent";
import type { ConcernContent } from "./articleMeta";
import { concerns, sitePage } from "./articleMeta";

export function ArticleListPage(): ReactNode {
  return (
    <ArticleSiteShell>
      <ListHero />
      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 12 }}>
        <VStack align="stretch" gap={{ base: 10, lg: 12 }}>
          <ConcernSection />
          <ArticleListSection title={sitePage.latestTitle} articles={articles} />
          <ArticleConversionCta />
        </VStack>
      </Container>
    </ArticleSiteShell>
  );
}

function ListHero(): ReactNode {
  return (
    <Box borderBottomWidth="1px" borderColor="gray.200" bg="white">
      <Container maxW={{ base: "820px", lg: "6xl" }} px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 10 }}>
        <VStack align="stretch" gap={{ base: 5, md: 6 }}>
          <Box display={{ base: "none", md: "block" }}>
            <ArticleBreadcrumbs items={[{ label: sitePage.breadcrumbLabel }]} />
          </Box>
          <VStack align="stretch" gap={{ base: 3, md: 4 }}>
            <Heading as="h1" color="gray.950" textStyle="pageTitle" letterSpacing="0">
              {sitePage.title}
            </Heading>
            <Text color="gray.700" textStyle={{ base: "bodySm", md: "body" }} lineHeight="1.8" maxW="680px">
              {sitePage.description}
            </Text>
          </VStack>
        </VStack>
      </Container>
    </Box>
  );
}

function ConcernSection(): ReactNode {
  return (
    <VStack as="section" align="stretch" gap={5}>
      <Heading as="h2" textStyle="sectionTitle" color="gray.950">
        {sitePage.concernTitle}
      </Heading>
      <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }} gap={4}>
        {concerns.map((concern) => (
          <ConcernCard key={concern.slug} concern={concern} />
        ))}
      </Grid>
    </VStack>
  );
}

function ConcernCard({ concern }: { concern: ConcernContent }): ReactNode {
  const Icon = getCategoryIcon(concern.slug);

  return (
    <Link
      href={concern.href}
      display="block"
      h="full"
      color="inherit"
      textDecoration="none"
      _hover={{ textDecoration: "none" }}
    >
      <Box
        as="article"
        h="full"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        p={5}
        bg="white"
        transition="border-color 0.2s ease, box-shadow 0.2s ease"
        _hover={{ borderColor: "gray.300", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)" }}
      >
        <VStack align="stretch" gap={{ base: 3, md: 4 }} h="full">
          <HStack align="center" gap={3}>
            <IconBadge icon={Icon} compact />
            <Heading as="h3" flex="1" fontSize="md" lineHeight="1.55" letterSpacing="0" color="gray.950">
              {concern.title}
            </Heading>
            <Box as="span" display={{ base: "block", md: "none" }} color="teal.700">
              <LuChevronRight size={16} />
            </Box>
          </HStack>
          <VStack align="stretch" gap={2} flex="1">
            <Heading
              as="h3"
              display={{ base: "none", md: "block" }}
              fontSize="md"
              lineHeight="1.55"
              letterSpacing="0"
              color="gray.950"
            >
              {concern.title}
            </Heading>
            <Text color="gray.600" textStyle="sm" lineHeight="1.7" lineClamp={{ base: 3, md: undefined }}>
              {concern.description}
            </Text>
          </VStack>
          <Text display={{ base: "none", md: "block" }} color="teal.700" textStyle="sm" fontWeight="bold">
            この困りごとを見る
            <Box as="span" ml={1}>
              →
            </Box>
          </Text>
        </VStack>
      </Box>
    </Link>
  );
}

function IconBadge({ icon, compact = false }: { icon: IconType; compact?: boolean }): ReactNode {
  const Icon = icon;

  return (
    <Flex
      boxSize={compact ? { base: 10, md: 12 } : 12}
      flexShrink={0}
      borderRadius="full"
      bg="teal.50"
      borderWidth="1px"
      borderColor="gray.200"
      color="teal.700"
      align="center"
      justify="center"
    >
      <Icon size={24} />
    </Flex>
  );
}

function getCategoryIcon(slug: string): IconType {
  switch (slug) {
    case "shift-request":
      return LuMessageCircle;
    case "shift-building":
      return LuTable2;
    case "shift-operation":
      return LuCalendarCheck;
    case "tool-review":
      return LuFileSpreadsheet;
    default:
      return LuBookOpen;
  }
}
