import { Badge, Box, Container, Flex, Grid, Heading, HStack, Icon, Stack, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuCheck, LuStar, LuStore, LuUserRoundCog, LuUsers } from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS, type OrganizationPlanLimits } from "@/convex/organizationBilling/planLimits";
import {
  formatPublicPlanPrice,
  formatPublicPlanPriceLine,
  type PublicPlanPrice,
  type PublicPlanPriceCatalog,
} from "@/src/domains/publicPricing";
import { LANDING_HEADER_SCROLL_MARGIN_TOP } from "../constants";
import { SectionHeading } from "../SectionHeading";

const planCards = [
  {
    id: "free",
    name: "Free",
    limits: ORGANIZATION_PLAN_LIMITS.free,
  },
  {
    id: "pro",
    name: "Pro",
    limits: ORGANIZATION_PLAN_LIMITS.pro,
    featured: true,
  },
  {
    id: "business",
    name: "Business",
    limits: ORGANIZATION_PLAN_LIMITS.business,
  },
] as const;

type PricingSectionProps = {
  prices: PublicPlanPriceCatalog;
};

export function PricingSection({ prices }: PricingSectionProps) {
  return (
    <Box
      as="section"
      id="pricing"
      bg="gray.50"
      py={{ base: 16, md: 20 }}
      scrollMarginTop={LANDING_HEADER_SCROLL_MARGIN_TOP}
    >
      <Container maxW="7xl">
        <VStack gap={{ base: 10, md: 12 }}>
          <VStack gap={3} textAlign="center">
            <SectionHeading phrases={["料金プラン"]} textAlign="center" />
            <Text color="gray.700" fontSize={{ base: "md", md: "lg" }} fontWeight="semibold" lineHeight="1.8">
              基本機能はすべてのプランで共通。
              <br />
              人数と店舗数に合わせて選べます。
            </Text>
          </VStack>

          <BusinessTrialNotice />

          <Grid templateColumns={{ base: "1fr", lg: "1fr 1.08fr 1fr" }} gap={{ base: 6, lg: 8 }} w="full" maxW="1040px">
            {planCards.map((plan) => (
              <PlanCard key={plan.id} {...plan} price={plan.id === "free" ? null : prices[plan.id]} />
            ))}
          </Grid>
        </VStack>
      </Container>
    </Box>
  );
}

function BusinessTrialNotice() {
  const limits = ORGANIZATION_PLAN_LIMITS.trial;

  return (
    <Stack
      as="aside"
      aria-label="Businessプランの無料トライアル"
      align="center"
      gap={{ base: 3, md: 4 }}
      w="full"
      maxW="1040px"
      bg="white"
      borderWidth="2px"
      borderColor="teal.600"
      borderRadius="xl"
      boxShadow="md"
      px={{ base: 5, md: 8 }}
      py={{ base: 6, md: 7 }}
      textAlign="center"
    >
      <Badge
        colorPalette="teal"
        variant="solid"
        borderRadius="full"
        gap={1.5}
        px={4}
        py={1.5}
        fontSize="sm"
        fontWeight="bold"
      >
        <Icon as={LuStar} boxSize={4} aria-hidden />
        登録から3か月間
      </Badge>
      <Text
        color="teal.700"
        fontSize={{ base: "2xl", md: "3xl" }}
        fontWeight="bold"
        lineHeight="1.4"
        textWrap="balance"
      >
        Businessプランを無料でお試し
      </Text>
      <Flex
        align="center"
        justify="center"
        direction={{ base: "column", md: "row" }}
        gap={{ base: 3, md: 5 }}
        color="gray.800"
      >
        <Flex align="center" gap={2} bg="teal.50" borderRadius="full" px={4} py={2} fontSize="sm" fontWeight="bold">
          <Icon as={LuCheck} boxSize={4} color="teal.700" flexShrink={0} aria-hidden />
          <Text as="span">クレジットカード不要</Text>
        </Flex>
        <Text fontSize={{ base: "sm", md: "md" }} fontWeight="semibold" lineHeight="1.7">
          スタッフ{limits.maxPeople}名・{limits.maxActiveShops}店舗・管理者{limits.maxActiveManagers}名まで
        </Text>
      </Flex>
    </Stack>
  );
}

function PlanCard({
  id,
  name,
  limits,
  price,
  featured = false,
}: {
  id: (typeof planCards)[number]["id"];
  name: string;
  limits: OrganizationPlanLimits;
  price: PublicPlanPrice | null;
  featured?: boolean;
}) {
  return (
    <Box
      as="article"
      position="relative"
      h="full"
      minH={{ lg: "350px" }}
      bg={featured ? "teal.50" : "white"}
      borderWidth="1px"
      borderColor={featured ? "teal.600" : "gray.200"}
      borderRadius="xl"
      boxShadow="sm"
      px={{ base: 6, lg: 8 }}
      py={7}
    >
      {featured && (
        <Badge
          position="absolute"
          top="-13px"
          left="50%"
          transform="translateX(-50%)"
          colorPalette="teal"
          variant="solid"
          borderRadius="full"
          px={4}
          py={1}
          fontSize="sm"
          fontWeight="bold"
          gap={1.5}
          whiteSpace="nowrap"
        >
          <Icon as={LuStar} boxSize={4} aria-hidden />
          おすすめ
        </Badge>
      )}

      <Stack align="center" gap={3} textAlign="center">
        <Stack align="center" w="full" pb={4} borderBottomWidth="1px" borderColor={featured ? "teal.200" : "gray.200"}>
          <Heading as="h3" color="teal.600" fontSize={{ base: "2xl", lg: "3xl" }} lineHeight="1.2" letterSpacing="0">
            {name}
          </Heading>
        </Stack>
        <Flex align="center" justify="center" minH="52px" w="full">
          <PlanPrice plan={id === "free" ? null : id} price={price} />
        </Flex>
      </Stack>

      <Stack as="ul" gap={3} listStyle="none" p={0} mt={3}>
        <PlanLimit icon={LuUsers} label={`スタッフ ${limits.maxPeople}名まで`} description="管理者を含む" />
        <PlanLimit icon={LuStore} label={`店舗数 ${limits.maxActiveShops}店舗まで`} />
        <PlanLimit icon={LuUserRoundCog} label={`管理者数 ${limits.maxActiveManagers}名まで`} />
      </Stack>
    </Box>
  );
}

function PlanPrice({ plan, price }: { plan: keyof PublicPlanPriceCatalog | null; price: PublicPlanPrice | null }) {
  if (!plan || !price) {
    return (
      <HStack align="baseline" justify="center" gap={3} color="gray.950" whiteSpace="nowrap">
        <Text
          as="span"
          fontSize={{ base: "4xl", lg: "40px" }}
          fontWeight="bold"
          fontVariantNumeric="tabular-nums"
          lineHeight="1"
        >
          ¥0
        </Text>
        <Text as="span" fontSize="sm" fontWeight="semibold">
          /月（税込）
        </Text>
      </HStack>
    );
  }

  const formatted = formatPublicPlanPrice(price);
  const priceLine = formatPublicPlanPriceLine(price);
  const suffix = priceLine.slice(formatted.amount.length);

  return (
    <HStack
      as="span"
      align="baseline"
      justify="center"
      gap={3}
      data-public-plan-price={plan}
      data-currency={price.currency}
      data-unit-amount={price.unitAmount}
      data-interval={price.interval}
      data-interval-count={price.intervalCount}
      data-tax-behavior={price.taxBehavior}
      color="gray.950"
      aria-label={priceLine}
      whiteSpace="nowrap"
    >
      <Text
        as="span"
        fontSize={{ base: "4xl", lg: "40px" }}
        fontWeight="bold"
        fontVariantNumeric="tabular-nums"
        lineHeight="1"
      >
        {formatted.amount}
      </Text>
      <Text as="span" fontSize="sm" fontWeight="semibold">
        {suffix}
      </Text>
    </HStack>
  );
}

function PlanLimit({ icon, label, description }: { icon: IconType; label: string; description?: string }) {
  return (
    <Flex as="li" align="center" gap={4} color="gray.900">
      <Icon as={icon} boxSize={{ base: 7, lg: 8 }} color="teal.600" flexShrink={0} aria-hidden />
      <Stack align="start" gap={0} textAlign="left">
        <Text as="span" fontSize={{ base: "md", lg: "lg" }} fontWeight="semibold" lineHeight="1.45">
          {label}
        </Text>
        {description && (
          <Text as="span" color="gray.700" fontSize="xs" fontWeight="medium" lineHeight="1.45">
            {description}
          </Text>
        )}
      </Stack>
    </Flex>
  );
}
