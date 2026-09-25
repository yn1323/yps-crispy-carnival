import { Box, Container, Flex, Heading, Icon, Link, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuArrowRight, LuChevronRight, LuMinus } from "react-icons/lu";
import { TrialReassurance } from "@/src/components/shared/TrialReassurance";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { FeatureBreadcrumbs } from "./FeatureBreadcrumbs";
import { FeatureCard } from "./FeatureCard";
import { FeatureCtaBand, FeatureSignupButton } from "./FeatureSignupCta";
import { getProductFeature, type ProductFeature } from "./productFeatureContent";
import type { ProductFeatureSlug } from "./productFeatureRoutes";
import { SentenceLines } from "./SentenceLines";

/** TOPの「毎月やることは3つだけ」と同じ3ステップで分け、店舗とスタッフの管理は流れの外に置く。 */
const FEATURE_GROUPS: ReadonlyArray<{ step?: number; title: string; slugs: readonly ProductFeatureSlug[] }> = [
  { step: 1, title: "シフトを募集する", slugs: ["shift-request-collection", "submission-reminder"] },
  { step: 2, title: "シフトを組む", slugs: ["shift-schedule"] },
  { step: 3, title: "シフトを確定する", slugs: ["shift-sharing"] },
  { title: "店舗とスタッフの管理", slugs: ["multi-store"] },
];

const unsupportedFeatures = ["出勤・退勤の打刻などの勤怠管理", "給与計算", "人数や条件からシフトを自動で組む機能"];

export function FeaturesHub() {
  return (
    <PublicPageLayout color="gray.950">
      <Box as="section" bg="white" pt={{ base: 4, md: 6 }} pb={{ base: 10, md: 14 }}>
        <Container maxW="7xl">
          <FeatureBreadcrumbs items={[{ label: "シフトリ", href: "/" }, { label: "機能一覧" }]} />
          <VStack align="center" gap={{ base: 4, md: 5 }} mt={{ base: 8, md: 12 }} textAlign="center">
            <Heading as="h1" fontSize={{ base: "3xl", md: "4xl" }} lineHeight="1.35" letterSpacing="0">
              シフトリの機能
            </Heading>
            <Text
              maxW="680px"
              color="gray.800"
              fontSize={{ base: "md", md: "lg" }}
              lineHeight="1.9"
              fontWeight="semibold"
            >
              <SentenceLines text="シフト作成に使う機能をまとめました。スタッフはアプリなしで使えます。" />
            </Text>
            <VStack align="center" gap={3} w={{ base: "full", md: "auto" }} pt={2}>
              <FeatureSignupButton position="hero" />
              <TrialReassurance />
            </VStack>
          </VStack>
        </Container>
      </Box>

      <Box as="section" bg="gray.50" py={{ base: 12, md: 16 }}>
        <Container maxW="5xl">
          <VStack align="stretch" gap={{ base: 10, md: 12 }}>
            {FEATURE_GROUPS.map((group) => (
              <FeatureGroup
                key={group.title}
                step={group.step}
                title={group.title}
                features={group.slugs
                  .map((slug) => getProductFeature(slug))
                  .filter((feature): feature is ProductFeature => feature !== undefined)}
              />
            ))}
          </VStack>
        </Container>
      </Box>

      <Box as="section" bg="#fbfefe" py={{ base: 12, md: 16 }}>
        <Container maxW="5xl">
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={{ base: 6, md: 8 }}>
            <InfoPanel title="シフトリにない機能">
              <Stack as="ul" gap={2} listStyleType="none" p={0}>
                {unsupportedFeatures.map((item) => (
                  <Flex as="li" key={item} align="center" gap={2} color="gray.800" fontSize="sm" fontWeight="semibold">
                    <Icon as={LuMinus} boxSize={4} color="gray.500" flexShrink={0} aria-hidden />
                    {item}
                  </Flex>
                ))}
              </Stack>
              <Text color="gray.700" fontSize="sm" lineHeight="1.8">
                <SentenceLines text="確定シフトはPDFやExcelに出力できます。給与計算などの資料に使えます。" />
              </Text>
            </InfoPanel>
            <InfoPanel title="料金プランと機能">
              <Text color="gray.700" fontSize="sm" lineHeight="1.8">
                <SentenceLines text="基本機能はどのプランも同じです。違いは人数・店舗数・管理者数の上限です。" />
              </Text>
              <Link
                href="/#pricing"
                color="teal.700"
                fontSize="sm"
                fontWeight="bold"
                display="inline-flex"
                alignItems="center"
                gap={2}
              >
                料金プランを見る
                <Icon as={LuArrowRight} boxSize={4} aria-hidden />
              </Link>
            </InfoPanel>
          </SimpleGrid>
          <Flex justify="center" mt={{ base: 8, md: 10 }}>
            <Link href="/help" color="teal.700" fontWeight="bold" display="inline-flex" alignItems="center" gap={1}>
              ヘルプ・使い方を見る
              <Icon as={LuChevronRight} boxSize={4} aria-hidden />
            </Link>
          </Flex>
        </Container>
      </Box>

      <FeatureCtaBand />
    </PublicPageLayout>
  );
}

function FeatureGroup({ step, title, features }: { step?: number; title: string; features: ProductFeature[] }) {
  return (
    <Box>
      {step !== undefined && (
        <Text color="teal.700" fontSize="sm" fontWeight="bold" lineHeight="1.4">
          STEP {step}
        </Text>
      )}
      <Heading as="h2" mt={1} fontSize={{ base: "xl", md: "2xl" }} lineHeight="1.4" letterSpacing="0">
        {title}
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={5} mt={{ base: 4, md: 5 }}>
        {features.map((feature) => (
          <FeatureCard key={feature.slug} feature={feature} showCapabilities />
        ))}
      </SimpleGrid>
    </Box>
  );
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={4} bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={{ base: 5, md: 7 }}>
      <Heading as="h2" fontSize={{ base: "lg", md: "xl" }} lineHeight="1.5">
        {title}
      </Heading>
      {children}
    </Stack>
  );
}
