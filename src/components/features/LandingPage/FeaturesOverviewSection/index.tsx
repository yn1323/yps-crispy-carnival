import { Box, Container, Flex, Icon, LinkBox, LinkOverlay, SimpleGrid, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuLayoutGrid } from "react-icons/lu";
import { PRODUCT_FEATURES } from "@/src/components/features/ProductFeatures/productFeatureContent";
import { PRODUCT_FEATURES_HREF } from "@/src/components/features/ProductFeatures/productFeatureRoutes";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { SectionHeading } from "../SectionHeading";

export const FeaturesOverviewSection = () => (
  <Box
    as="section"
    id="features"
    bg="white"
    py={{ base: 14, md: 18 }}
    scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}
  >
    <Container maxW="7xl">
      <SectionHeading phrases={["シフトリの主な機能"]} textAlign="center" />

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4} mt={{ base: 8, md: 10 }}>
        {PRODUCT_FEATURES.map((feature) => (
          <FeatureLinkCard
            key={feature.slug}
            href={feature.href}
            icon={feature.icon}
            title={feature.name}
            body={feature.summary}
          />
        ))}
        <FeatureLinkCard
          href={PRODUCT_FEATURES_HREF}
          icon={LuLayoutGrid}
          title="機能一覧"
          body="すべての機能を確認できます"
        />
      </SimpleGrid>
    </Container>
  </Box>
);

const FeatureLinkCard = ({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: IconType;
  title: string;
  body: string;
}) => (
  <LinkBox
    as="article"
    display="flex"
    gap={4}
    bg="white"
    borderWidth="1px"
    borderColor="gray.200"
    borderRadius="xl"
    p={{ base: 5, md: 6 }}
    transition="border-color 0.2s ease, box-shadow 0.2s ease"
    _hover={{ borderColor: "gray.300", boxShadow: "0 16px 34px rgba(15, 23, 42, 0.08)" }}
  >
    <Flex align="center" justify="center" flexShrink={0} boxSize={12} bg="teal.50" color="teal.700" borderRadius="full">
      <Icon as={icon} boxSize={6} aria-hidden />
    </Flex>
    <Flex direction="column" gap={1.5} minW={0} flex="1">
      <Text as="h3" color="gray.950" fontSize="lg" fontWeight="bold" lineHeight="1.5">
        <LinkOverlay href={href}>{title}</LinkOverlay>
      </Text>
      <Text color="gray.700" fontSize="sm" lineHeight="1.8">
        {body}
      </Text>
      <Flex align="center" gap={1.5} mt="auto" pt={1} color="teal.700" fontSize="sm" fontWeight="bold">
        詳しく見る
        <Icon as={LuArrowRight} boxSize={4} aria-hidden />
      </Flex>
    </Flex>
  </LinkBox>
);
