import {
  Accordion,
  Box,
  Container,
  Flex,
  Grid,
  Heading,
  Icon,
  Image,
  Link,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuArrowLeft, LuArrowRight, LuBookOpen, LuCheck, LuCircleAlert, LuNewspaper } from "react-icons/lu";
import { articleMetas } from "@/src/components/features/ArticleSite/articleMeta";
import { TrialReassurance } from "@/src/components/shared/TrialReassurance";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Empty } from "@/src/components/ui/Empty";
import { FeatureBreadcrumbs } from "./FeatureBreadcrumbs";
import { FeatureCard } from "./FeatureCard";
import { FeatureCtaBand, FeatureSignupButton } from "./FeatureSignupCta";
import {
  getProductFeature,
  type ProductFeature,
  type ProductFeatureCapability,
  type ProductFeatureLink,
  type ProductFeatureScreen,
} from "./productFeatureContent";
import { PRODUCT_FEATURES_HREF } from "./productFeatureRoutes";

export function FeatureDetail({ slug }: { slug: string }) {
  const feature = getProductFeature(slug);
  if (!feature) return <FeatureNotFound />;

  return <FeatureDetailView feature={feature} />;
}

function FeatureDetailView({ feature }: { feature: ProductFeature }) {
  const showcased = feature.capabilities.filter((capability) => capability.screen);
  const others = feature.capabilities.filter((capability) => !capability.screen);
  const relatedFeatures = feature.related
    .map((slug) => getProductFeature(slug))
    .filter((related): related is ProductFeature => related !== undefined);
  const articleLinks: ProductFeatureLink[] = feature.articleSlugs.flatMap((slug) => {
    const article = articleMetas.find((meta) => meta.slug === slug);
    return article ? [{ href: article.canonicalPath, label: article.title }] : [];
  });

  return (
    <PublicPageLayout color="gray.950">
      <Box as="section" bg="white" pt={{ base: 4, md: 6 }} pb={{ base: 10, md: 14 }}>
        <Container maxW="7xl">
          <FeatureBreadcrumbs
            items={[
              { label: "シフトリ", href: "/" },
              { label: "機能一覧", href: PRODUCT_FEATURES_HREF },
              { label: feature.name },
            ]}
          />
          <Grid
            templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr)" }}
            gap={{ base: 6, lg: 12 }}
            alignItems="center"
            mt={{ base: 5, md: 8 }}
          >
            <VStack align="start" gap={{ base: 4, md: 5 }}>
              <Flex align="center" gap={2} color="teal.700" fontSize="sm" fontWeight="bold">
                <Flex align="center" justify="center" boxSize={8} bg="teal.50" borderRadius="full">
                  <Icon as={feature.icon} boxSize={4} aria-hidden />
                </Flex>
                {feature.name}
              </Flex>
              <Heading
                as="h1"
                wordBreak="auto-phrase"
                fontSize={{ base: "2xl", sm: "3xl", xl: "4xl" }}
                lineHeight="1.35"
                letterSpacing="0"
                textWrap="balance"
              >
                {feature.heading}
              </Heading>
              <Text color="gray.800" fontSize={{ base: "md", md: "lg" }} lineHeight="1.9" fontWeight="semibold">
                {feature.lead}
              </Text>
              <VStack align={{ base: "stretch", md: "start" }} gap={3} w="full" pt={2}>
                <FeatureSignupButton position="hero" />
                <TrialReassurance />
              </VStack>
            </VStack>
            <Image
              src={feature.illustration.src}
              alt={feature.illustration.alt}
              w="full"
              aspectRatio={3 / 2}
              objectFit="contain"
              fetchPriority="high"
              decoding="async"
            />
          </Grid>
        </Container>
      </Box>

      <Box as="section" bg="gray.50" py={{ base: 12, md: 16 }}>
        <Container maxW="6xl">
          <SectionTitle>こんなことに困っていませんか</SectionTitle>
          <SimpleGrid as="ul" columns={{ base: 1, md: 3 }} gap={4} mt={{ base: 6, md: 8 }} listStyleType="none" p={0}>
            {feature.pains.map((pain) => (
              <Flex
                as="li"
                key={pain}
                align="flex-start"
                gap={3}
                bg="white"
                borderWidth="1px"
                borderColor="gray.200"
                borderRadius="lg"
                p={5}
              >
                <Icon as={LuCircleAlert} boxSize={5} mt={0.5} color="orange.500" flexShrink={0} aria-hidden />
                <Text color="gray.900" fontSize="sm" fontWeight="bold" lineHeight="1.7">
                  {pain}
                </Text>
              </Flex>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      <Box as="section" bg="white" py={{ base: 14, md: 20 }}>
        <Container maxW="6xl">
          <SectionTitle>できること</SectionTitle>
          <VStack align="stretch" gap={{ base: 12, md: 16 }} mt={{ base: 8, md: 12 }}>
            {showcased.map((capability, index) => (
              <ShowcaseRow key={capability.title} capability={capability} reverse={index % 2 === 1} />
            ))}
          </VStack>
          {others.length > 0 && (
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={5} mt={{ base: 12, md: 16 }}>
              {others.map((capability) => (
                <CapabilityCard key={capability.title} capability={capability} />
              ))}
            </SimpleGrid>
          )}
        </Container>
      </Box>

      <Box as="section" bg="#fbfefe" py={{ base: 12, md: 16 }}>
        <Container maxW="6xl">
          <SectionTitle>使い方</SectionTitle>
          <SimpleGrid as="ol" columns={{ base: 1, md: 3 }} gap={5} mt={{ base: 6, md: 8 }} p={0} listStyleType="none">
            {feature.steps.map((step, index) => (
              <Stack
                as="li"
                key={step.title}
                gap={3}
                bg="white"
                borderWidth="1px"
                borderColor="gray.200"
                borderRadius="xl"
                p={{ base: 5, md: 6 }}
              >
                <Flex
                  align="center"
                  justify="center"
                  boxSize={9}
                  bg="teal.600"
                  color="white"
                  borderRadius="full"
                  fontWeight="bold"
                  aria-hidden
                >
                  {index + 1}
                </Flex>
                <Heading as="h3" wordBreak="auto-phrase" fontSize="lg" lineHeight="1.5">
                  {step.title}
                </Heading>
                <Text color="gray.700" fontSize="sm" lineHeight="1.8">
                  {step.body}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      <Box as="section" bg="white" py={{ base: 12, md: 16 }}>
        <Container maxW="4xl">
          <SectionTitle>よくある質問</SectionTitle>
          <Accordion.Root collapsible multiple variant="plain" mt={{ base: 6, md: 8 }}>
            <VStack align="stretch" gap={2.5}>
              {feature.faqs.map((faq) => (
                <Accordion.Item
                  key={faq.q}
                  value={faq.q}
                  bg="white"
                  borderWidth="1px"
                  borderColor="gray.200"
                  borderRadius="md"
                  overflow="hidden"
                >
                  <Accordion.ItemTrigger px={4} py={3} cursor="pointer" textAlign="left" _hover={{ bg: "gray.50" }}>
                    <Text as="span" flex="1" color="gray.950" fontSize="sm" fontWeight="bold" lineHeight="1.6">
                      {faq.q}
                    </Text>
                    <Accordion.ItemIndicator color="teal.600" />
                  </Accordion.ItemTrigger>
                  <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.100">
                    <Accordion.ItemBody px={4} py={4}>
                      <Text color="gray.700" fontSize="sm" lineHeight="1.8" fontWeight="semibold">
                        {faq.a}
                      </Text>
                    </Accordion.ItemBody>
                  </Accordion.ItemContent>
                </Accordion.Item>
              ))}
            </VStack>
          </Accordion.Root>
        </Container>
      </Box>

      <Box as="section" bg="gray.50" py={{ base: 12, md: 16 }}>
        <Container maxW="6xl">
          <SectionTitle>関連する機能</SectionTitle>
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={5} mt={{ base: 6, md: 8 }}>
            {relatedFeatures.map((related) => (
              <FeatureCard key={related.slug} feature={related} />
            ))}
          </SimpleGrid>
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={{ base: 8, md: 10 }} mt={{ base: 10, md: 12 }}>
            <LinkList title="使い方" icon={LuBookOpen} links={feature.helpLinks} />
            <LinkList title="関連する記事" icon={LuNewspaper} links={articleLinks} />
          </SimpleGrid>
          <Flex justify="center" mt={{ base: 10, md: 12 }}>
            <Link
              href={PRODUCT_FEATURES_HREF}
              color="teal.700"
              fontWeight="bold"
              display="inline-flex"
              alignItems="center"
              gap={2}
            >
              すべての機能を見る
              <Icon as={LuArrowRight} boxSize={4} aria-hidden />
            </Link>
          </Flex>
        </Container>
      </Box>

      <FeatureCtaBand />
    </PublicPageLayout>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h2"
      wordBreak="auto-phrase"
      fontSize={{ base: "2xl", md: "3xl" }}
      lineHeight="1.5"
      letterSpacing="0"
      textAlign="center"
      textWrap="balance"
    >
      {children}
    </Heading>
  );
}

function ShowcaseRow({ capability, reverse }: { capability: ProductFeatureCapability; reverse: boolean }) {
  return (
    <Grid
      templateColumns={{ base: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" }}
      gap={{ base: 6, md: 12 }}
      alignItems="center"
    >
      <VStack align="start" gap={3} order={{ base: 0, md: reverse ? 1 : 0 }}>
        <Heading
          as="h3"
          wordBreak="auto-phrase"
          fontSize={{ base: "xl", md: "2xl" }}
          lineHeight="1.45"
          letterSpacing="0"
        >
          {capability.title}
        </Heading>
        <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} lineHeight="1.9">
          {capability.body}
        </Text>
      </VStack>
      {capability.screen && <ScreenVisual screen={capability.screen} />}
    </Grid>
  );
}

function ScreenVisual({ screen }: { screen: ProductFeatureScreen }) {
  if (screen.frame === "desktop") {
    return (
      <Flex
        align="center"
        justify="center"
        bg="#eaf8f6"
        borderRadius="2xl"
        px={{ base: 4, md: 8 }}
        py={{ base: 6, md: 8 }}
      >
        <Image src={screen.src} alt={screen.alt} w="full" objectFit="contain" loading="lazy" decoding="async" />
      </Flex>
    );
  }

  // スマホ画面は上部だけを切り抜いた素材のため、枠の下端で画面を切って見せる。
  return (
    <Flex
      align="flex-start"
      justify="center"
      h={{ base: "300px", md: "360px" }}
      bg="#eaf8f6"
      borderRadius="2xl"
      pt={{ base: 6, md: 8 }}
      overflow="hidden"
    >
      <Image
        src={screen.src}
        alt={screen.alt}
        w={{ base: "240px", md: "290px" }}
        objectFit="contain"
        loading="lazy"
        decoding="async"
      />
    </Flex>
  );
}

function CapabilityCard({ capability }: { capability: ProductFeatureCapability }) {
  return (
    <Stack gap={3} borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={{ base: 5, md: 6 }}>
      <Flex align="center" justify="center" boxSize={9} bg="teal.50" color="teal.700" borderRadius="full">
        <Icon as={LuCheck} boxSize={5} aria-hidden />
      </Flex>
      <Heading as="h3" wordBreak="auto-phrase" fontSize="lg" lineHeight="1.5">
        {capability.title}
      </Heading>
      <Text color="gray.700" fontSize="sm" lineHeight="1.8">
        {capability.body}
      </Text>
    </Stack>
  );
}

function LinkList({ title, icon, links }: { title: string; icon: typeof LuBookOpen; links: ProductFeatureLink[] }) {
  if (links.length === 0) return null;

  return (
    <Box>
      <Heading as="h3" display="flex" alignItems="center" gap={2} fontSize="lg" lineHeight="1.5">
        <Icon as={icon} boxSize={5} color="teal.600" aria-hidden />
        {title}
      </Heading>
      <Stack as="ul" gap={2} mt={3} listStyleType="none" p={0}>
        {links.map((link) => (
          <Box as="li" key={link.href} borderBottomWidth="1px" borderColor="gray.200">
            <Link
              href={link.href}
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap={3}
              py={3}
              color="gray.900"
              fontSize="sm"
              fontWeight="semibold"
              lineHeight="1.6"
              _hover={{ color: "teal.700", textDecoration: "none" }}
            >
              {link.label}
              <Icon as={LuArrowRight} boxSize={4} color="teal.600" flexShrink={0} aria-hidden />
            </Link>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function FeatureNotFound() {
  return (
    <PublicPageLayout>
      <Container maxW="720px" px={4} py={{ base: 12, lg: 20 }}>
        <Empty
          icon={LuCircleAlert}
          title="機能のページが見つかりません"
          titleAs="h1"
          action={
            <Link
              href={PRODUCT_FEATURES_HREF}
              color="teal.700"
              fontWeight="bold"
              display="inline-flex"
              alignItems="center"
              gap={2}
            >
              <LuArrowLeft aria-hidden />
              機能一覧へ戻る
            </Link>
          }
          size="lg"
          minH="360px"
        />
      </Container>
    </PublicPageLayout>
  );
}
