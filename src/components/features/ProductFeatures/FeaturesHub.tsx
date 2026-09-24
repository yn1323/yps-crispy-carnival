import { Box, Container, Flex, Heading, Icon, Link, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuArrowRight, LuChevronRight, LuMinus } from "react-icons/lu";
import { TrialReassurance } from "@/src/components/shared/TrialReassurance";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { FeatureBreadcrumbs } from "./FeatureBreadcrumbs";
import { FeatureCard } from "./FeatureCard";
import { FeatureCtaBand, FeatureSignupButton } from "./FeatureSignupCta";
import { PRODUCT_FEATURES } from "./productFeatureContent";
import type { ProductFeatureSlug } from "./productFeatureRoutes";

/** 毎月のシフト作成で使う順番。店舗とスタッフの管理は流れの外に置く。 */
const MONTHLY_FLOW_SLUGS: readonly ProductFeatureSlug[] = [
  "shift-request-collection",
  "submission-reminder",
  "shift-schedule",
  "shift-sharing",
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
              希望シフトの回収から確定シフトの共有まで、毎月のシフト作成に必要な機能をまとめています。スタッフはアプリを入れずに、LINEやメールに届くリンクから使えます。
            </Text>
            <VStack align="center" gap={3} w={{ base: "full", md: "auto" }} pt={2}>
              <FeatureSignupButton position="hero" />
              <TrialReassurance />
            </VStack>
          </VStack>
        </Container>
      </Box>

      <Box as="section" bg="gray.50" py={{ base: 12, md: 16 }}>
        <Container maxW="7xl">
          <SectionTitle
            title="毎月のシフト作成で使う機能"
            description="シフト募集から確定シフトの共有までの順に並べています。複数の店舗やシフト担当者で使うための機能もあります。"
          />
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={5} mt={{ base: 6, md: 8 }}>
            {PRODUCT_FEATURES.map((feature) => {
              const flowIndex = MONTHLY_FLOW_SLUGS.indexOf(feature.slug);
              return (
                <FeatureCard
                  key={feature.slug}
                  feature={feature}
                  stepNumber={flowIndex === -1 ? undefined : flowIndex + 1}
                />
              );
            })}
          </SimpleGrid>
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
                シフトの募集から確定と共有までに機能を絞っています。確定したシフトはPDFやExcelに出力できるので、勤怠管理や給与計算の資料に使えます。
              </Text>
            </InfoPanel>
            <InfoPanel title="料金プランと機能">
              <Text color="gray.700" fontSize="sm" lineHeight="1.8">
                Free、Standard、Proのどのプランでも、基本機能は同じです。プランによって変わるのは、利用人数、店舗数、管理者数の上限です。
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
              操作方法はヘルプ・使い方で確認できます
              <Icon as={LuChevronRight} boxSize={4} aria-hidden />
            </Link>
          </Flex>
        </Container>
      </Box>

      <FeatureCtaBand />
    </PublicPageLayout>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <VStack gap={2} textAlign="center">
      <Heading
        as="h2"
        wordBreak="auto-phrase"
        fontSize={{ base: "2xl", md: "3xl" }}
        lineHeight="1.5"
        letterSpacing="0"
        textWrap="balance"
      >
        {title}
      </Heading>
      <Text color="gray.700" fontSize={{ base: "sm", md: "md" }} lineHeight="1.8" fontWeight="semibold">
        {description}
      </Text>
    </VStack>
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
