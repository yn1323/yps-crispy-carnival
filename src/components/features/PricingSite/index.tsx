import { Badge, Box, Container, Flex, Heading, Icon, Link, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBuilding2, LuCalendarDays, LuChevronRight, LuCreditCard, LuStore, LuUsers } from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { MeasurementBoundaryLink } from "@/src/components/shared/MeasurementBoundaryLink";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";

const planCards = [
  {
    id: "complimentary-business",
    name: "Business",
    eyebrow: "初回登録",
    description: "初回登録で作る最初の組織には、支払い不要のBusinessが適用されます。",
    priceLabel: "支払い情報の登録なし",
    limits: {
      maxPeople: ORGANIZATION_PLAN_LIMITS.business.maxPeople,
      maxActiveShops: 1,
      maxActiveManagers: 1,
    },
    featured: true,
  },
] as const;

const billingFacts: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuBuilding2,
    title: "初回登録で一つの組織",
    body: "最初の組織と店舗を初回登録で一度だけ作ります。現在、二つ目の組織を追加する機能は公開していません。",
  },
  {
    icon: LuStore,
    title: "一店舗を本人が管理",
    body: "現在の公開範囲は一店舗と管理者本人一名です。スタッフの希望回収から確定通知までを同じ店舗で進めます。",
  },
  {
    icon: LuCreditCard,
    title: "支払い情報の登録は不要",
    body: "初回登録ではカード情報や支払い方法の入力を求めません。支払い不要のBusinessで利用を始められます。",
  },
];

export function PricingSite() {
  return (
    <PublicPageLayout headerProps={{ showLinks: false }}>
      <Box bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
        <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, md: 14 }}>
          <Link href="/" color="teal.700" fontSize="sm" fontWeight="bold" _hover={{ textDecoration: "none" }}>
            ← TOPへ
          </Link>
          <Stack gap={6} maxW="840px" mt={6}>
            <Stack gap={4}>
              <Badge alignSelf="flex-start" colorPalette="teal" variant="subtle" borderRadius="full" px={3} py={1}>
                料金・プラン
              </Badge>
              <Heading
                as="h1"
                color="gray.950"
                fontSize={{ base: "3xl", md: "5xl" }}
                lineHeight="1.25"
                letterSpacing="0"
              >
                支払い情報を登録せず、
                <Box as="span" display="block" color="teal.700">
                  実際のシフト運用を始められます
                </Box>
              </Heading>
              <Text color="gray.700" fontSize={{ base: "md", md: "lg" }} lineHeight="1.9" maxW="760px">
                初回登録で作る最初の組織には、支払い不要のBusinessが適用されます。2ヶ月のトライアル期限や支払い方法の登録はありません。
              </Text>
            </Stack>
            <Stack direction={{ base: "column", sm: "row" }} gap={3} align={{ base: "stretch", sm: "center" }}>
              <Button asChild colorPalette="teal" h="52px" px={7} fontWeight="bold">
                <MeasurementBoundaryLink href="/signup" measurementCtaId="pricing_signup">
                  シフトリを始める
                  <Icon as={LuChevronRight} boxSize={5} />
                </MeasurementBoundaryLink>
              </Button>
              <Button asChild variant="outline" colorPalette="teal" bg="white" h="52px" px={7} fontWeight="bold">
                <MeasurementBoundaryLink href="/demo/flow" measurementCtaId="pricing_demo">
                  登録せず無料デモを試す
                </MeasurementBoundaryLink>
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 12, md: 18 }}>
        <Stack gap={{ base: 12, md: 16 }}>
          <Box as="section" aria-labelledby="plan-comparison-heading">
            <Stack gap={3} maxW="760px" mb={7}>
              <Heading id="plan-comparison-heading" as="h2" color="gray.950" fontSize={{ base: "2xl", md: "3xl" }}>
                初回登録で利用できるプラン
              </Heading>
              <Text color="gray.700" lineHeight="1.8">
                現在の公開範囲は、1組織・1店舗・1管理者です。利用人数はBusinessの上限まで登録できます。
              </Text>
            </Stack>
            <SimpleGrid columns={1} gap={5} maxW="640px">
              {planCards.map((plan) => (
                <PlanCard key={plan.id} {...plan} />
              ))}
            </SimpleGrid>
          </Box>

          <Box as="section" aria-labelledby="billing-unit-heading">
            <Heading id="billing-unit-heading" as="h2" color="gray.950" fontSize={{ base: "2xl", md: "3xl" }} mb={7}>
              組織、店舗、管理者と支払いの関係
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={5}>
              {billingFacts.map((fact) => (
                <Box key={fact.title} bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={6}>
                  <Flex align="center" justify="center" boxSize={11} bg="teal.50" color="teal.700" borderRadius="lg">
                    <Icon as={fact.icon} boxSize={6} />
                  </Flex>
                  <Heading as="h3" color="gray.950" fontSize="lg" mt={5}>
                    {fact.title}
                  </Heading>
                  <Text color="gray.700" fontSize="sm" lineHeight="1.8" mt={3}>
                    {fact.body}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </Box>

          <Box
            as="section"
            aria-labelledby="initial-registration-heading"
            bg="teal.50"
            borderRadius="2xl"
            px={{ base: 5, md: 8 }}
            py={{ base: 7, md: 8 }}
          >
            <Flex align="flex-start" gap={4}>
              <Flex
                align="center"
                justify="center"
                boxSize={11}
                bg="teal.100"
                color="teal.800"
                borderRadius="lg"
                flexShrink={0}
              >
                <Icon as={LuCalendarDays} boxSize={6} />
              </Flex>
              <Stack gap={3}>
                <Heading
                  id="initial-registration-heading"
                  as="h2"
                  color="gray.950"
                  fontSize={{ base: "xl", md: "2xl" }}
                >
                  初回登録はトライアルではありません
                </Heading>
                <Text color="gray.800" lineHeight="1.85">
                  初回登録で作る最初の組織には、2ヶ月のトライアル終了日を設定しません。支払い情報を登録せず、支払い不要のBusinessで利用を始めます。
                </Text>
                <Text color="gray.800" lineHeight="1.85">
                  複数組織、複数店舗、複数管理者、有料プランの契約と支払いは、現在の公開範囲に含まれません。
                </Text>
              </Stack>
            </Flex>
          </Box>
        </Stack>
      </Container>
    </PublicPageLayout>
  );
}

function PlanCard({ name, eyebrow, description, priceLabel, limits, featured }: (typeof planCards)[number]) {
  return (
    <Box bg={featured ? "teal.50" : "white"} borderWidth="1px" borderColor="gray.200" borderRadius="2xl" px={6} py={7}>
      <Text color="teal.800" fontSize="sm" fontWeight="bold">
        {eyebrow}
      </Text>
      <Heading as="h3" color="gray.950" fontSize="2xl" mt={2}>
        {name}
      </Heading>
      <Text color="gray.700" fontSize="sm" lineHeight="1.8" minH={{ lg: "76px" }} mt={3}>
        {description}
      </Text>
      <Text color="gray.950" fontWeight="bold" mt={5}>
        {priceLabel}
      </Text>
      <Stack as="ul" gap={3} listStyle="none" p={0} mt={6}>
        <PlanLimit icon={LuUsers} label={`利用人数 ${limits.maxPeople}名まで`} />
        <PlanLimit icon={LuStore} label={`稼働店舗 ${limits.maxActiveShops}店舗まで`} />
        <PlanLimit icon={LuBuilding2} label={`有効な管理者 ${limits.maxActiveManagers}名まで`} />
      </Stack>
    </Box>
  );
}

function PlanLimit({ icon, label }: { icon: IconType; label: string }) {
  return (
    <Flex as="li" align="center" gap={3} color="gray.800" fontSize="sm" fontWeight="semibold">
      <Icon as={icon} boxSize={5} color="teal.700" flexShrink={0} />
      {label}
    </Flex>
  );
}
